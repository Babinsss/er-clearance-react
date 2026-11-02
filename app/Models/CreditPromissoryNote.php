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
        'fa_grantors',
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
        'fa_grantors' => 'array',
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

    protected static function booted()
    {
        static::saving(function ($model) {
            $model->hospital_bill_balance = (float) ($model->hospital_bill_balance ?? 0);
            $model->pn_amount = (float) ($model->pn_amount ?? 0);
            $model->fa_amount = (float) ($model->fa_amount ?? 0);
            $model->cash_paid = (float) ($model->cash_paid ?? 0);
            $model->discount = (float) ($model->discount ?? 0);
            $model->dialysis_fee = (float) ($model->dialysis_fee ?? 0);
            $model->remaining_balance = (float) ($model->remaining_balance ?? 0);
            $model->is_absconded = (bool) ($model->is_absconded ?? false);
            $model->is_pn = (bool) ($model->is_pn ?? false);
            $model->is_nbb = (bool) ($model->is_nbb ?? false);
            $model->is_vawc_er = (bool) ($model->is_vawc_er ?? false);
            $model->is_non_nbb = (bool) ($model->is_non_nbb ?? false);

            if (empty($model->entry_date)) $model->entry_date = null;
            if (empty($model->fa_date)) $model->fa_date = null;
            if (empty($model->or_date)) $model->or_date = null;
        });
    }
}
