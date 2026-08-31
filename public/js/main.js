// public/js/main.js
// Application entry point — initializes all modules

import { initUI, UI } from './ui.js';
import { initNetwork } from './network.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Main] DoodleFour Race initializing...');

  // Setup UI bindings
  initUI();

  // Connect to server and setup socket events
  initNetwork();

  // Show home screen
  UI.showScreen('home');

  console.log('[Main] Ready!');
});
