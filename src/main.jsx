// V21: Entry point. Mounts React tree with Router, providers, and design tokens.
//
// SPA fallback: when GH Pages serves 404.html for an unknown path, that
// handler stores the requested route in sessionStorage under 'titan:redirect'
// and redirects to /TITAN/. On boot here, if that key is set, we <Navigate>
// to the original path. After the redirect is consumed, clear the key so
// normal browser back/forward doesn't re-trigger it.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/TITAN/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);