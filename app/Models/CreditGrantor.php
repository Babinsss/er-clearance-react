<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CreditGrantor extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'proponent',
        'saa_number',
        'allocated_budget',
        'utilized_budget',
        'remaining_balance',
        'category',
        'remarks',
        'is_active',
    ];

    protected $casts = [
        'allocated_budget' => 'float',
        'utilized_budget' => 'float',
        'remaining_balance' => 'float',
        'is_active' => 'boolean',
    ];
}
