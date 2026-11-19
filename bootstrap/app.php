<?php

use Dotenv\Dotenv;
use Dotenv\Repository\Adapter\EnvConstAdapter;
use Dotenv\Repository\Adapter\ServerConstAdapter;
use Dotenv\Repository\RepositoryBuilder;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Env;

// Prevent thread-unsafe putenv() collisions across Laragon Apache virtual hosts
Env::disablePutenv();

$isTestingEnv = ($_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? null) === 'testing';
$envRepoBuilder = RepositoryBuilder::createWithNoAdapters()
    ->addAdapter(EnvConstAdapter::class)
    ->addAdapter(ServerConstAdapter::class);

if ($isTestingEnv) {
    $envRepoBuilder = $envRepoBuilder->immutable();
}

$envRepo = $envRepoBuilder->make(); // Mutable in web/CLI so .env overrides inherited Laragon vars; immutable in tests

Dotenv::create($envRepo, dirname(__DIR__))->safeLoad();

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
            \App\Http\Middleware\UpdateUserLastSeen::class,
        ]);

        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
