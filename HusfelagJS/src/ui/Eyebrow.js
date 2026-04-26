import React from 'react';
import { Box } from '@mui/material';

/**
 * Eyebrow label — uppercase, tracked, small.
 * variant: 'green' | 'navy' | 'muted'
 */
export default function Eyebrow({ children, variant = 'green', sx = {} }) {
    const color = variant === 'navy' ? '#1D366F' : variant === 'muted' ? '#888' : '#08C076';
    return (
        <Box component="span" sx={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color,
            ...sx,
        }}>
            {children}
        </Box>
    );
}
