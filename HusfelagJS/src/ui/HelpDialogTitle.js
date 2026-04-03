// src/ui/HelpDialogTitle.js
import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from './HelpContext';

/**
 * Drop-in replacement for MUI DialogTitle that adds a "?" help icon
 * and a "✕" close icon to the right of the title text.
 *
 * Usage:
 *   <HelpDialogTitle helpSection="innheimta-tengja" onClose={onClose}>
 *     Tengja greiðslu
 *   </HelpDialogTitle>
 */
export default function HelpDialogTitle({ children, helpSection, onClose }) {
    const { openHelp } = useHelp();

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderBottom: '1px solid #e8e8e8',
        }}>
            <Typography variant="h6" component="div">
                {children}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {helpSection && (
                    <Tooltip title="Hjálp">
                        <IconButton size="small" onClick={() => openHelp(helpSection)}>
                            <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                        </IconButton>
                    </Tooltip>
                )}
                {onClose && (
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
}
