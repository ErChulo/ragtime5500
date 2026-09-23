import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Application root not found.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
