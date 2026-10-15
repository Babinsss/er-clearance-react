<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class UpdateUserLastSeen
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()) {
            $user = $request->user();

            // Throttle database writes: update at most once every 30 seconds per user
            if (!$user->last_seen_at || now()->diffInSeconds($user->last_seen_at) > 30 || !$user->is_online) {
                $user->updateQuietly([
                    'last_seen_at' => now(),
                    'is_online' => true,
                    'last_ip_address' => $request->ip(),
                ]);
            }
        }

        return $next($request);
    }
}

