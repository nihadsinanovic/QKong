# QKong

A browser remake of the 1982 dual-screen Game & Watch "Donkey Kong" handheld.
Kong throws Qvantum logos down the construction site instead of barrels.

It's a plain static site (`index.html`, `style.css`, `game.js`) with no build
step and no dependencies. The handheld is drawn entirely in CSS, and the two
LCD screens are canvases.

## Play

| Action | Keyboard | On the device |
| --- | --- | --- |
| Move | Arrow keys / WASD | Controller (D-pad) |
| Jump / Start | Space, Z, X, Enter | JUMP |
| Game A (normal) | 1 | GAME A |
| Game B (fast) | 2 | GAME B |
| Clock + demo | T | TIME |
| Sound on/off | M | ACL light |

Climb from the bottom-left of the lower screen up to the top of the upper
screen. On the way, jump over the rolling Qvantum barrels (+1 each). At the top,
jump for the crane hook when it swings down to you (+5). Each ride knocks out
one of the four bolts under Kong's platform. Knock out all four and Kong falls
(+20). You get three misses. Reach 300 points and your misses are cleared once.
Game B is faster and Kong throws more often. The high score is saved in the
browser.

## Run locally

```sh
python3 -m http.server 8000   # or: npx serve .
```

Then open http://localhost:8000.

## Deploy to Vercel

1. Import this repository in Vercel (**Add New → Project**).
2. Leave the framework preset on **Other**, with no build command and the output directory set to the root.
3. Click **Deploy**.

You can also deploy from the CLI with `npx vercel --prod` in this folder.

## Credits

The "QVANTUM" plate uses [Jost](https://github.com/indestructible-type/Jost)
by indestructible type*, licensed under the SIL Open Font License 1.1. It's
subset to the letters of the wordmark.
