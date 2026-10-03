import { app } from "./server";

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "127.0.0.1";

const server = app.listen(
    port,
    host,
    () => {
        console.log(
            `SGAR POS running at http://${host}:${port}`
        );
    }
);

server.on(
    "error",
    (error: any) => {

        console.error(
            "SGAR POS server error:",
            error
        );

        process.exit(1);
    }
);
