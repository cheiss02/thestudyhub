#!/bin/sh
# Run after changing any CSS/JS so browsers load the new files right away.
V=$(date +%Y%m%d%H%M)
sed -i.bak -E "s#((href|src)=\"/?(css|js)/[A-Za-z0-9._-]+\.(css|js))(\?v=[0-9]+)?\"#\1?v=$V\"#g" *.html && rm -f *.html.bak
echo "Version set to $V"
