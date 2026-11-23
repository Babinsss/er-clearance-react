<?php

namespace App\Services;

use App\Http\Controllers\BillingController;
use App\Models\Department;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * Resolves department operating schedules and computes effective working-hours
 * turnaround durations so non-24/7 stations (e.g. Credit and Collection) are not
 * penalized for closed overnight hours.
 */
class DepartmentOperatingHours
{
    public const TIMEZONE = 'Asia/Manila';

    /**
     * @var Collection<int, Department>|null
     */
    private ?Collection $departments = null;

    /**
     * @var array<string, array{is_24_7: bool, open_time: ?string, close_time: ?string}>
     */
    private array $scheduleCache = [];

    /**
     * Load department schedules from the database once per service instance.
     */
    private function loadDepartments(): Collection
    {
        if ($this->departments !== null) {
            return $this->departments;
        }

        if (!Schema::hasTable('departments')) {
            return $this->departments = collect();
        }

        return $this->departments = Department::query()
            ->select(['name', 'category', 'is_24_7', 'open_time', 'close_time'])
            ->get();
    }

    /**
     * Resolve schedule configuration for a department name or alias.
     *
     * @return array{is_24_7: bool, open_time: ?string, close_time: ?string}
     */
    public function getSchedule(string $department): array
    {
        $key = strtolower(trim($department));
        if (isset($this->scheduleCache[$key])) {
            return $this->scheduleCache[$key];
        }

        $canonical = BillingController::resolveCanonicalCostCenter($department) ?? trim($department);
        $departments = $this->loadDepartments();

        $matched = $departments->first(function (Department $dept) use ($department, $canonical) {
            $name = trim((string) $dept->name);
            return strcasecmp($name, trim($department)) === 0
                || strcasecmp($name, $canonical) === 0
                || BillingController::departmentsMatch($canonical, $name);
        });

        if ($matched && !$matched->is_24_7 && $this->isValidTime($matched->open_time) && $this->isValidTime($matched->close_time)) {
            return $this->scheduleCache[$key] = [
                'is_24_7' => false,
                'open_time' => $matched->open_time,
                'close_time' => $matched->close_time,
            ];
        }

        if ($matched && $matched->is_24_7) {
            return $this->scheduleCache[$key] = [
                'is_24_7' => true,
                'open_time' => null,
                'close_time' => null,
            ];
        }

        // Fallback default when the departments table has not been seeded yet (e.g. in tests)
        if ($this->isCreditAndCollection($canonical)) {
            return $this->scheduleCache[$key] = [
                'is_24_7' => false,
                'open_time' => '07:00',
                'close_time' => '18:30',
            ];
        }

        return $this->scheduleCache[$key] = [
            'is_24_7' => true,
            'open_time' => null,
            'close_time' => null,
        ];
    }

    /**
     * Calculate effective working-hours seconds between $start and $end.
     */
    public function calculateEffectiveSeconds(string $department, CarbonInterface $start, CarbonInterface $end): int
    {
        $startLocal = Carbon::instance($start)->timezone(self::TIMEZONE);
        $endLocal = Carbon::instance($end)->timezone(self::TIMEZONE);

        $startTs = $startLocal->getTimestamp();
        $endTs = $endLocal->getTimestamp();

        if ($endTs <= $startTs) {
            return 0;
        }

        $schedule = $this->getSchedule($department);
        if ($schedule['is_24_7'] || !$schedule['open_time'] || !$schedule['close_time']) {
            return $endTs - $startTs;
        }

        [$openHour, $openMin] = $this->parseTime($schedule['open_time']);
        [$closeHour, $closeMin] = $this->parseTime($schedule['close_time']);
        $crossesMidnight = ($closeHour * 60 + $closeMin) <= ($openHour * 60 + $openMin);

        // Step 1 day earlier when a schedule crosses midnight so yesterday's shift tail is counted.
        $cursor = $startLocal->copy()->startOfDay();
        if ($crossesMidnight) {
            $cursor->subDay();
        }
        $lastDay = $endLocal->copy()->startOfDay();

        $effectiveSeconds = 0;

        while ($cursor->lte($lastDay)) {
            $windowStart = $cursor->copy()->setTime($openHour, $openMin, 0);
            $windowEnd = $cursor->copy()->setTime($closeHour, $closeMin, 0);
            if ($crossesMidnight) {
                $windowEnd->addDay();
            }

            $overlapStart = max($startTs, $windowStart->getTimestamp());
            $overlapEnd = min($endTs, $windowEnd->getTimestamp());

            if ($overlapEnd > $overlapStart) {
                $effectiveSeconds += ($overlapEnd - $overlapStart);
            }

            $cursor->addDay();
        }

        return $effectiveSeconds;
    }

    /**
     * Compute effective turnaround, raw wall-clock duration, and off-hours status.
     *
     * @return array{effective_seconds: int, wall_seconds: int, is_24_7: bool, off_hours_cleared: bool}
     */
    public function calculateMetrics(string $department, CarbonInterface $start, CarbonInterface $end): array
    {
        $wallSeconds = max(0, $end->getTimestamp() - $start->getTimestamp());
        $schedule = $this->getSchedule($department);
        $effectiveSeconds = $this->calculateEffectiveSeconds($department, $start, $end);
        $offHoursCleared = !$schedule['is_24_7'] && !$this->isOpenAt($department, $end);

        return [
            'effective_seconds' => $effectiveSeconds,
            'wall_seconds' => $wallSeconds,
            'is_24_7' => $schedule['is_24_7'],
            'off_hours_cleared' => $offHoursCleared,
        ];
    }

    /**
     * Check whether the department is open at a given moment.
     */
    public function isOpenAt(string $department, ?CarbonInterface $at = null): bool
    {
        $schedule = $this->getSchedule($department);
        if ($schedule['is_24_7'] || !$schedule['open_time'] || !$schedule['close_time']) {
            return true;
        }

        $local = ($at ? Carbon::instance($at) : now())->timezone(self::TIMEZONE);
        [$openHour, $openMin] = $this->parseTime($schedule['open_time']);
        [$closeHour, $closeMin] = $this->parseTime($schedule['close_time']);
        $crossesMidnight = ($closeHour * 60 + $closeMin) <= ($openHour * 60 + $openMin);

        $daysToCheck = $crossesMidnight ? [-1, 0] : [0];
        $ts = $local->getTimestamp();

        foreach ($daysToCheck as $dayOffset) {
            $base = $local->copy()->startOfDay()->addDays($dayOffset);
            $windowStart = $base->copy()->setTime($openHour, $openMin, 0);
            $windowEnd = $base->copy()->setTime($closeHour, $closeMin, 0);
            if ($crossesMidnight) {
                $windowEnd->addDay();
            }

            if ($ts >= $windowStart->getTimestamp() && $ts < $windowEnd->getTimestamp()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return schedule metadata and live open/closed status for UI display.
     *
     * @return array{
     *     is_24_7: bool,
     *     is_open_now: bool,
     *     open_time: ?string,
     *     close_time: ?string,
     *     hours_label: string,
     *     next_open_label: ?string
     * }
     */
    public function getStatusAt(string $department, ?CarbonInterface $at = null): array
    {
        $schedule = $this->getSchedule($department);
        if ($schedule['is_24_7'] || !$schedule['open_time'] || !$schedule['close_time']) {
            return [
                'is_24_7' => true,
                'is_open_now' => true,
                'open_time' => null,
                'close_time' => null,
                'hours_label' => '24/7',
                'next_open_label' => null,
            ];
        }

        $local = ($at ? Carbon::instance($at) : now())->timezone(self::TIMEZONE);
        [$openHour, $openMin] = $this->parseTime($schedule['open_time']);
        [$closeHour, $closeMin] = $this->parseTime($schedule['close_time']);

        $openFormatted = $local->copy()->setTime($openHour, $openMin)->format('g:i A');
        $closeFormatted = $local->copy()->setTime($closeHour, $closeMin)->format('g:i A');
        $isOpenNow = $this->isOpenAt($department, $local);

        $nextOpenLabel = null;
        if (!$isOpenNow) {
            $todayOpen = $local->copy()->setTime($openHour, $openMin, 0);
            $nextOpenLabel = $local->lt($todayOpen)
                ? "Opens {$openFormatted}"
                : "Opens tomorrow {$openFormatted}";
        }

        return [
            'is_24_7' => false,
            'is_open_now' => $isOpenNow,
            'open_time' => $schedule['open_time'],
            'close_time' => $schedule['close_time'],
            'hours_label' => "{$openFormatted} – {$closeFormatted}",
            'next_open_label' => $nextOpenLabel,
        ];
    }

    private function isCreditAndCollection(string $name): bool
    {
        $upper = strtoupper(trim($name));
        return str_contains($upper, 'CREDIT') || str_contains($upper, 'COLLECT');
    }

    private function isValidTime(?string $time): bool
    {
        return is_string($time) && preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time) === 1;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function parseTime(string $time): array
    {
        [$h, $m] = explode(':', $time);
        return [(int) $h, (int) $m];
    }
}
