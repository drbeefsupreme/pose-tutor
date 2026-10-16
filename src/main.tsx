import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TutorApp } from './ui/TutorApp';
import '@fontsource/bebas-neue/400.css';
import '@fontsource-variable/outfit/index.css';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

createRoot(root).render(
  <StrictMode>
    <TutorApp />
  </StrictMode>,
);
