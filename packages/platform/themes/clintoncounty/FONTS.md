# Clinton County brand fonts

The Grow Clinton brand sheet names three faces. The Clinton AR app and brand portal use them
as web fonts:

| Face                   | File                                                                 | Used for                      |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Luxia Regular          | `assets/clintoncounty/{ar,brand}/fonts/luxia-regular.woff2`          | titles, the CLINTON wordmark  |
| Typograph Pro Light    | `assets/clintoncounty/{ar,brand}/fonts/typograph-pro-light.woff2`    | body text                     |
| Typograph Pro SemiBold | `assets/clintoncounty/{ar,brand}/fonts/typograph-pro-semibold.woff2` | menus, labels, buttons, notes |

They are declared with `@font-face` in `ar.css` and `brand.css`. Federo and Quicksand (Google
Fonts, OFL) load alongside them as fallbacks for characters the brand fonts lack.

## Licensing

- Luxia: Andrew Herndon (https://gumroad.com/l/luxia).
- Typograph Pro: Aleksandar Petkov Aleksandrov (sold on MyFonts).

The files were converted to WOFF2 from the copies supplied by the project owner, who confirmed
on 2026-11-19 that Clinton holds the rights to use these fonts on its websites. The supplied
Luxia download is the designer's personal-use edition, whose own terms do not allow website
use without written permission; keep the web licence (or that permission) on file, and swap in
the purchased web-font files if they differ.
