import React from 'react';
import { AppShell } from './AppShell';

export const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      <AppShell />
    </div>
  );
};

export default App;
