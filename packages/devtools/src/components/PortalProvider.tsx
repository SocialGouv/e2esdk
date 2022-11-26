import React from 'react'

const PortalContext = React.createContext<any>(null)

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const ref = React.useRef(null)
  return (
    <PortalContext.Provider value={ref}>
      {children}
      <div ref={ref} />
    </PortalContext.Provider>
  )
}

export function usePortalRef() {
  return React.useContext(PortalContext)
}
