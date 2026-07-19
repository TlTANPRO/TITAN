// V21: Entry point. Mounts React tree with Router, providers, and design tokens.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/titan/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
