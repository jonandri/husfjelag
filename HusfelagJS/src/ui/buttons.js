// src/ui/buttons.js

export const primaryButtonSx = {
    backgroundColor: '#1D366F',
    color: '#fff',
    textTransform: 'none',
    fontWeight: 500,
    '&:hover': { backgroundColor: '#162d5e' },
    '&:disabled': { backgroundColor: '#c5cfe8', color: '#fff' },
};

export const secondaryButtonSx = {
    color: '#1D366F',
    borderColor: '#1D366F',
    textTransform: 'none',
    fontWeight: 500,
    '&:hover': { backgroundColor: '#eef1f8', borderColor: '#1D366F' },
};

export const ghostButtonSx = {
    textTransform: 'none',
    fontWeight: 400,
    color: '#555',
};

export const destructiveButtonSx = {
    textTransform: 'none',
    fontWeight: 400,
    color: '#c62828',
    padding: 0,
    minWidth: 0,
    '&:hover': { color: '#8b0000', backgroundColor: 'transparent' },
};
