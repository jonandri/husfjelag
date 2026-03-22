import { useState } from 'react';
import { TableSortLabel } from '@mui/material';

/** Sx applied to <TableHead> for a distinct, branded header */
export const HEAD_SX = {
    backgroundColor: 'rgba(29,54,111,0.07)',
    '& th': {
        borderBottom: '2px solid rgba(29,54,111,0.15)',
    },
};

/** Sx applied to each <TableCell> inside the header */
export const HEAD_CELL_SX = {
    fontWeight: 700,
    fontSize: '0.78rem',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: 'text.secondary',
    py: 1.25,
};

/**
 * Sorting hook for tables.
 * @param {string} defaultKey  - field key to sort by initially
 * @param {'asc'|'desc'} defaultDir
 * @returns {{ sort(arr): arr, lbl(key, label): JSX }}
 */
export function useSort(defaultKey, defaultDir = 'asc') {
    const [key, setKey] = useState(defaultKey);
    const [dir, setDir] = useState(defaultDir);

    const toggle = (k) => {
        if (k === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setKey(k); setDir('asc'); }
    };

    const sort = (arr) => [...arr].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        // Numeric strings (e.g. Decimal fields from API)
        const na = parseFloat(av), nb = parseFloat(bv);
        const cmp = (!isNaN(na) && !isNaN(nb) && typeof av !== 'boolean')
            ? (na - nb)
            : typeof av === 'string'
                ? av.localeCompare(bv, 'is', { sensitivity: 'base' })
                : (av < bv ? -1 : av > bv ? 1 : 0);
        return dir === 'asc' ? cmp : -cmp;
    });

    const lbl = (k, children) => (
        <TableSortLabel
            active={key === k}
            direction={key === k ? dir : 'asc'}
            onClick={() => toggle(k)}
        >
            {children}
        </TableSortLabel>
    );

    return { sort, lbl };
}
