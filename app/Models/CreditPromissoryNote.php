<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CreditPromissoryNote extends Model
{
    use HasFactory;

    protected $fillable = [
        'sheet_category',
        'entry_date',
        'patient_name',
        'address',
        'hospital_bill_balance',
        'is_absconded',
        'is_pn',
        'pn_amount',
        'is_nbb',
        'is_vawc_er',
        'is_non_nbb',
        'age',
        'sex',
        'fa_amount',
        'fa_grantor',
        'fa_date',
        'cash_paid',
        'or_number',
        'or_date',
        'discount',
        'dialysis_fee',
        'remaining_balance',
        'guarantor_name',
        'remarks',
        'status',
        'created_by',
    ];

    protected $casts = [
        'entry_date' => 'date',
        'fa_date' => 'date',
        'or_date' => 'date',
        'is_absconded' => 'boolean',
        'is_pn' => 'boolean',
        'is_nbb' => 'boolean',
        'is_vawc_er' => 'boolean',
        'is_non_nbb' => 'boolean',
        'hospital_bill_balance' => 'float',
        'pn_amount' => 'float',
        'fa_amount' => 'float',
        'cash_paid' => 'float',
        'discount' => 'float',
        'dialysis_fee' => 'float',
        'remaining_balance' => 'float',
    ];
}
