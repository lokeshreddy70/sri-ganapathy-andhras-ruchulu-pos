/*
 * SGAR POS
 * Service worker intentionally performs no application caching.
 *
 * Production POS authentication and transactional API
 * requests must always use the live server response.
 */

self.addEventListener("install", function(event){

    self.skipWaiting();

});

self.addEventListener("activate", function(event){

    event.waitUntil(

        caches
            .keys()
            .then(function(keys){

                return Promise.all(
                    keys.map(function(key){
                        return caches.delete(key);
                    })
                );

            })
            .then(function(){

                return self.clients.claim();

            })

    );

});

self.addEventListener(
    "fetch",
    function(event){

        /*
         * Network/browser handles requests.
         * No application cache is maintained here.
         */

    }
);
