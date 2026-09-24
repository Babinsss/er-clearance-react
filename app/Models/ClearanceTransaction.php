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
    ];
}
