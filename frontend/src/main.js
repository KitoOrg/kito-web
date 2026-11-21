import { mount } from 'svelte';
// The typeface, carried with the client: nothing is asked of anybody else.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });
