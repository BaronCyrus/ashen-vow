import './style.css';
import { Game } from './game/Game';

const app = document.querySelector<HTMLElement>('#app')!;

try {
  const game = new Game(app);
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')) {
    Object.defineProperty(window, '__ashen', { value: game, configurable: true });
  }
} catch (error) {
  console.error('Unable to initialize Ashen Vow:', error);
  app.innerHTML = `<div class="fallback"><span>ASHEN VOW</span><h1>The sanctum could not awaken.</h1><p>This game needs WebGL 2. Enable hardware acceleration in a current desktop browser, then reload to enter the sanctum.</p><button onclick="window.location.reload()">TRY AGAIN</button></div>`;
}
