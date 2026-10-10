# Pixel Train Journey

A pixel-art train ride from Dhaka to Khulna (over the Padma Bridge), drawn entirely in code on a canvas.

- Stops: Dhaka, Bhanga Jn, Jashore, Khulna. Scenery changes with the route.
- Controls: Pause, speed (1x / 2x / 3x), Next (skip to next stop), music on/off.
  Keyboard: Space = pause, Right arrow = next, M = music.
- Music: `assets/bus-sohokari.mp3` starts at 0:39 and loops back to 0:39.
  To change the start point or the song, edit `MUSIC_START` and `MUSIC_SRC` at the top of `game.js`.
- Debug: add `?at=5200&paused=1` to the URL to jump to a world position.

No build step. Open `index.html` through any static server (or deploy the folder on Vercel as a static site).
