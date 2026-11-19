<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClearanceTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'enccode',
        'hospital_number',
        'patient_name',
        'room_ward',
        'arrival_datetime',
        'disposition',
        'overall_status',
        'is_oecb',
        'has_oxygen',
        'oxygen_remarks',
        'requires_or',
        'requires_nicu',
        'encoded_by',
    ];

    protected $casts = [
        'is_oecb' => 'boolean',
        'has_oxygen' => 'boolean',
        'requires_or' => 'boolean',
        'requires_nicu' => 'boolean',
    ];
}