import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import { colors } from './design-tokens';
for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--${name}`, value);
createRoot(document.getElementById('root')!).render(<App/>);
