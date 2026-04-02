// src/controlers/tableUtils.js
import React, { useState } from 'react';
import { TableCell, TableSortLabel } from '@mui/material';
import { fmtAmount } from '../format';

/** Sx applied to <TableHead> */
export const HEAD_SX = {
    backgroundColor: '#f5f5f5',
    '& th': { borderBottom: '1px solid #e8e8e8' },
};

/** Sx applied to each <TableCell> inside the header */
export const HEAD_CELL_SX = {
    fontWeight: 600,
    fontSize: '0.7rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#888',
    py: 1.25,
    whiteSpace: 'nowrap',
};

/** Sx for totals/footer rows */
export const TOTALS_ROW_SX = {
    '& td': {
        fontWeight: 600,
        borderTop: '2px solid rgba(0,0,0,0.12)',
        color: 'text.primary',
    },
};

/**
 * Table cell for currency amounts.
 * Green for positive, red for negative, grey for zero.
 */
export function AmountCell({ value, sx = {}, ...props }) {
    const n = parseFloat(value) || 0;
    const color = n > 0 ? '#2e7d32' : n < 0 ? '#c62828' : 'text.disabled';
    return (
        <TableCell
            align="right"
            sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color, ...sx }}
            {...props}
        >
            {fmtAmount(n)}
        </TableCell>
    );
}

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
