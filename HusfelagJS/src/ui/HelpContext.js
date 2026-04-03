import React, { createContext, useContext, useState } from 'react';

const HelpContext = createContext(null);

export function HelpProvider({ children }) {
    const [open, setOpen] = useState(false);
    const [section, setSection] = useState(null);

    const openHelp = (key) => { setSection(key); setOpen(true); };
    const closeHelp = () => setOpen(false);

    return (
        <HelpContext.Provider value={{ open, section, openHelp, closeHelp }}>
            {children}
        </HelpContext.Provider>
    );
}

export function useHelp() {
    return useContext(HelpContext);
}
