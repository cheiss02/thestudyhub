/* Rules page: the text lives in rules.html. This only draws the header and footer. */
renderChrome('rules').then(() => { if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); });
