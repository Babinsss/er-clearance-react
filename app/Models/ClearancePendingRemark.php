<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClearancePendingRemark extends Model
{
    use HasFactory;

    protected $fillable = [
        'enccode',
        'department',
        'user_id',
        'remarks',
    ];

    public function transaction()
    {
        return $this->belongsTo(ClearanceTransaction::class, 'enccode', 'enccode');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
