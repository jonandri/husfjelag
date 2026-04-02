// src/ui/chips.js
import React from 'react';
import { Box } from '@mui/material';

const CHIP_STYLES = {
    CATEGORISED: { bg: '#f3f4f6', color: '#555',    label: 'Flokkað'   },
    IMPORTED:    { bg: '#fff8e1', color: '#e65100',  label: 'Óflokkað'  },
    RECONCILED:  { bg: '#e8f4fd', color: '#1565c0',  label: 'Jafnað'    },
    PAID:        { bg: '#e8f5e9', color: '#2e7d32',  label: 'Greitt'    },
    UNPAID:      { bg: '#fff3e0', color: '#e65100',  label: 'Ógreitt'   },
};

export function StatusChip({ status }) {
    const s = CHIP_STYLES[status] || { bg: '#f3f4f6', color: '#555', label: status };
    return (
        <Box component="span" sx={{
            background: s.bg,
            color: s.color,
            px: 1,
            py: 0.25,
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            display: 'inline-block',
            whiteSpace: 'nowrap',
        }}>
            {s.label}
        </Box>
    );
}
