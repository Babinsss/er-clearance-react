/**
 * Shared ward-to-cost-center routing helpers for frontend views.
 */
export function supportsAdditionalClearance(wardStr) {
    const ward = (wardStr || '').toLowerCase().trim();
    const isEr = ward === 'emergency room' || ward === 'er' || ward.includes('emergency');
    const isOutpatient =
        ward.includes('outpatient') ||
        ward.includes('opd') ||
        ward.includes('hemodialysis') ||
        ward.includes('dialysis') ||
        ward.includes('hdu');
    return !isEr && !isOutpatient;
}

export function getRequiredDepartments(wardStr, requiresOr = false, requiresNicu = false) {
    const base = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
    const ward = (wardStr || '').toLowerCase().trim();
    const isEr = ward === 'emergency room' || ward === 'er' || ward.includes('emergency');
    const isSurgOrtho = ward.includes('ortho') || ward.includes('surg');
    const isOB = ward.includes('ob');
    const isNicuWard = ward === 'nicu' || ward.includes('neonatal');
    const isOutpatient =
        ward.includes('outpatient') ||
        ward.includes('opd') ||
        ward.includes('hemodialysis') ||
        ward.includes('dialysis') ||
        ward.includes('hdu');

    if (isOutpatient) {
        return [...base, 'HDU'];
    }

    const depts = [...base];
    if (!isEr) {
        depts.push('Credit and Collection');
    }
    if (isSurgOrtho) {
        depts.push('OR');
    } else if (isOB) {
        depts.push('LR/DR');
    }

    if (!isEr) {
        if (requiresOr && !depts.includes('OR')) {
            depts.push('OR');
        }

        if (requiresNicu && !isNicuWard && !depts.includes('NICU')) {
            depts.push('NICU');
        }
    }

    return depts;
}

export function isDepartmentCleared(clearedDepartments = [], targetDept = '') {
    const cleanTarget = (targetDept || '').toUpperCase().trim();
    return (clearedDepartments || []).some((d) => {
        const cleanD = (d || '').toUpperCase().trim();
        if (cleanD === cleanTarget) return true;
        if (cleanTarget === 'CREDIT AND COLLECTION' && (cleanD.includes('CREDIT') || cleanD.includes('COLLECT'))) return true;
        if (cleanTarget === 'OR' && (cleanD === 'OR/LR/DR' || cleanD === 'OPERATING ROOM')) return true;
        if (cleanTarget === 'LR/DR' && (cleanD === 'OR/LR/DR' || cleanD === 'LR / DR' || cleanD === 'LR' || cleanD === 'DR' || cleanD === 'DELIVERY ROOM')) return true;
        if (cleanTarget === 'HDU' && (cleanD === 'HDU' || cleanD === 'CKD' || cleanD === 'DIALYSIS' || cleanD === 'DIALYSIS UNIT' || cleanD === 'HEMODIALYSIS')) return true;
        if (cleanTarget === 'CARDIO PULMO' && (cleanD.includes('CARDIO') || cleanD.includes('ECG'))) return true;
        if (cleanTarget === 'NICU' && (cleanD === 'NICU' || cleanD === 'NICU WARD' || cleanD.includes('NEONATAL'))) return true;
        return false;
    });
}
