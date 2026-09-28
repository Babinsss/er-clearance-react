<?php

/**
 * Finds which iHOMIS tables/columns contain a given code.
 *
 * Save as: app/Console/Commands/FindIhomisCode.php
 * Run:     php artisan ihomis:find-code 01800100035 01809200004
 *          php artisan ihomis:find-code "LABOR0020706/08/2009WRD3050109" --max-rows=1000000
 */

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FindIhomisCode extends Command
{
    protected $signature = 'ihomis:find-code
                            {codes* : Item codes to look for}
                            {--max-rows=300000 : Skip tables estimated to have more rows than this}';

    protected $description = 'List every iHOMIS table.column that contains the given codes';

    public function handle(): int
    {
        $db    = DB::connection('ihomis');
        $codes = array_map('trim', $this->argument('codes'));
        $marks = implode(',', array_fill(0, count($codes), '?'));

        $this->info('Schema: ' . $db->selectOne('select database() as d')->d);

        // Text columns in small tables (likely masters), plus the two order tables.
        $columns = $db->select("
            select c.table_name as t, c.column_name as col
            from information_schema.columns c
            join information_schema.tables x
              on x.table_schema = c.table_schema
             and x.table_name   = c.table_name
            where c.table_schema = database()
              and x.table_type = 'BASE TABLE'
              and (x.table_rows < ? or c.table_name in ('hdocord', 'hrxo'))
              and c.data_type in ('char', 'varchar')
        ", [(int) $this->option('max-rows')]);

        $this->line(count($columns) . ' text columns to scan (this can take a few minutes)...');

        foreach ($columns as $c) {
            $expr = "trim(`{$c->col}`)";

            try {
                $hits = $db->table($c->t)
                    ->whereRaw("$expr in ($marks)", $codes)
                    ->selectRaw("$expr as v")
                    ->distinct()
                    ->pluck('v');
            } catch (\Throwable $e) {
                continue; // unreadable table or odd column, skip it
            }

            if ($hits->isNotEmpty()) {
                $this->line("{$c->t}.{$c->col}  =>  " . $hits->implode(', '));
            }
        }

        $this->info('Done.');

        return 0;
    }
}