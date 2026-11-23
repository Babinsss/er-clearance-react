<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'is_24_7',
        'open_time',
        'close_time',
    ];

    protected $casts = [
        'is_24_7' => 'boolean',
    ];
}