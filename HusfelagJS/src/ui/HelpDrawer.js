// src/ui/HelpDrawer.js
import React from 'react';
import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useHelp } from './HelpContext';
import { HELP } from './helpContent';

export default function HelpDrawer() {
    const { open, section, closeHelp } = useHelp();
    const content = section ? HELP[section] : null;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={closeHelp}
            variant="temporary"
            ModalProps={{ keepMounted: false }}
            sx={{ zIndex: 1400 }}
            PaperProps={{ sx: { width: 380 } }}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <Box sx={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 3, py: 2,
                    borderBottom: '1px solid #e8e8e8',
                    flexShrink: 0,
                }}>
                    <Typography variant="h6">
                        {content?.title ?? 'Hjálp'}
                    </Typography>
                    <IconButton size="small" onClick={closeHelp}>
                        <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Box>

                {/* Body */}
                <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
                    {!content && (
                        <Typography variant="body2" color="text.secondary">
                            Engar hjálparupplýsingar fundust.
                        </Typography>
                    )}
                    {content && (
                        <>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                {content.intro}
                            </Typography>
                            {content.items.map((item, i) => (
                                <Box key={i} sx={{ mb: 2.5 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                        {item.heading}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: item.image ? 1.5 : 0 }}>
                                        {item.body}
                                    </Typography>
                                    {item.image && (
                                        <Box
                                            component="img"
                                            src={`/help/${item.image}`}
                                            alt={item.heading}
                                            sx={{
                                                width: '100%',
                                                borderRadius: '8px',
                                                border: '1px solid #e8e8e8',
                                                display: 'block',
                                            }}
                                        />
                                    )}
                                </Box>
                            ))}
                        </>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
}
