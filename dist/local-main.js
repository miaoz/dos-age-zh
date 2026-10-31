import { setActive, setQuiet, openSettings } from './game.js';
import { setAway, click } from './sound.js';
setActive(true); setQuiet(false); setAway(false);
document.querySelector('.gear').addEventListener('click', e => {click(); openSettings(); e.currentTarget.blur();});
document.querySelector('#close-info').addEventListener('click', () => {document.querySelector('.local-info').open = false; document.querySelector('#screen').focus();});
