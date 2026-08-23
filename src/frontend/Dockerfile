FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# The production build inlines the Google Fonts stylesheet at build time, so it has to
# fetch fonts.googleapis.com from inside this container. That host resolves to an IPv4 and
# an IPv6 address, the bridge network has no working IPv6 route, and Node's Happy Eyeballs
# races the two and gives up on the whole connection in ~300ms rather than falling back —
# so the build fails with ETIMEDOUT while wget from the same container succeeds. Turning
# the race off makes it try the addresses in order and reach the IPv4 one.
#
# Not --dns-result-order=ipv4first: that reorders dns.lookup, which the fetch under the
# font inliner does not go through, and the build fails exactly as before.
ENV NODE_OPTIONS=--no-network-family-autoselection

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/hisaabkitaab/browser /usr/share/nginx/html
EXPOSE 80
