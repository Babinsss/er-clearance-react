<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClearanceRerouteHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'enccode',
        'cycle_number',
        'previous_status',
        'previous_routed_at',
        'previous_cleared_at',
        'previous_logs',
        'reroute_reason',
        'rerouted_by',
        'rerouted_by_user_id',
    ];

    protected $casts = [
        'previous_routed_at' => 'datetime',
        'previous_cleared_at' => 'datetime',
        'previous_logs' => 'array',
    ];

    public function transaction()
    {
        return $this->belongsTo(ClearanceTransaction::class, 'enccode', 'enccode');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'rerouted_by_user_id');
    }
}
