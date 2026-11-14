/* Help page: the text lives in help.html. This only draws the header and footer. */
renderChrome('help').then(() => { if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); });
