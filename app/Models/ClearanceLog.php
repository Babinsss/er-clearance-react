<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClearanceLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'enccode',
        'department',
        'user_id',
    ];
}