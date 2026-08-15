const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// =====================================
// MIDDLEWARE
// =====================================

app.use(helmet());

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST"]
    })
);

app.use(express.json());

// =====================================
// SOCKET.IO
// =====================================

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// =====================================
// SECURITY / SESSION STATE
// =====================================

// Online responders
const responders = new Set();

// Active SOS sessions
//
// sosId -> {
//     sosId,
//     userSocketId,
//     responderSocketId,
//     startedAt,
//     status
// }

const activeSessions = new Map();

// User socket -> SOS ID
const userSessions = new Map();

// Responder socket -> SOS ID
const responderSessions = new Map();

// =====================================
// HELPERS
// =====================================

function generateSOSId() {

    const randomPart =
        crypto
            .randomBytes(6)
            .toString("hex")
            .toUpperCase();

    return `SOS-${Date.now()}-${randomPart}`;
}


// -------------------------------------
// Check active user session
// -------------------------------------

function getUserSession(socket) {

    const sosId =
        userSessions.get(socket.id);

    if (!sosId) {
        return null;
    }

    const session =
        activeSessions.get(sosId);

    if (!session) {

        userSessions.delete(socket.id);

        return null;
    }

    return session;
}


// -------------------------------------
// Check responder session
// -------------------------------------

function getResponderSession(socket) {

    const sosId =
        responderSessions.get(socket.id);

    if (!sosId) {
        return null;
    }

    const session =
        activeSessions.get(sosId);

    if (!session) {

        responderSessions.delete(socket.id);

        return null;
    }

    return session;
}


// -------------------------------------
// Check responder authorization
// -------------------------------------

function isAuthorizedResponder(
    socket,
    session
) {

    return (
        socket.role === "responder" &&
        session &&
        session.responderSocketId === socket.id
    );
}


// -------------------------------------
// Check user authorization
// -------------------------------------

function isAuthorizedUser(
    socket,
    session
) {

    return (
        socket.role === "user" &&
        session &&
        session.userSocketId === socket.id
    );
}

// =====================================
// HEALTH CHECK
// =====================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "SOS Guardian Backend is running",

        version:
            "3.0.0",

        security:
            "session authorization enabled",

        signaling:
            "WebRTC enabled"

    });

});

// =====================================
// SOCKET CONNECTION
// =====================================

io.on("connection", (socket) => {

    console.log(
        `🟢 Socket connected: ${socket.id}`
    );


    // =================================
    // USER IDENTIFICATION
    // =================================

    socket.on(
        "user-online",
        () => {

            socket.role = "user";

            console.log(
                `👤 USER ONLINE: ${socket.id}`
            );

            socket.emit(
                "user-ready"
            );

        }
    );


    // =================================
    // RESPONDER ONLINE
    // =================================

    socket.on(
        "responder-online",
        () => {

            socket.role = "responder";

            responders.add(
                socket.id
            );

            console.log(
                `👮 RESPONDER ONLINE: ${socket.id}`
            );

            socket.emit(
                "responder-ready"
            );

            console.log(
                `👮 AVAILABLE RESPONDERS: ${responders.size}`
            );

        }
    );


    // =================================
    // USER STARTS SOS
    // =================================

    socket.on(
        "sos-start",
        () => {

            console.log(
                `🚨 SOS START REQUEST: ${socket.id}`
            );


            // ---------------------------------
            // FORCE USER ROLE
            // ---------------------------------

            if (
                socket.role &&
                socket.role !== "user"
            ) {

                console.warn(
                    `🚫 SOS START BLOCKED: ${socket.id}`
                );

                return;
            }

            socket.role = "user";


            // ---------------------------------
            // DUPLICATE SOS PROTECTION
            // ---------------------------------

            if (
                userSessions.has(socket.id)
            ) {

                console.warn(
                    `⚠️ DUPLICATE SOS BLOCKED: ${socket.id}`
                );

                return;
            }


            // ---------------------------------
            // FIND AVAILABLE RESPONDER
            // ---------------------------------

            let assignedResponder = null;

            for (
                const responderId
                of responders
            ) {

                if (
                    !responderSessions.has(
                        responderId
                    )
                ) {

                    assignedResponder =
                        responderId;

                    break;
                }
            }


            // ---------------------------------
            // NO RESPONDER
            // ---------------------------------

            if (!assignedResponder) {

                console.warn(
                    "⚠️ NO RESPONDER AVAILABLE"
                );

                socket.emit(
                    "no-responder"
                );

                return;
            }


            // ---------------------------------
            // CREATE SECURE SOS SESSION
            // ---------------------------------

            const sosId =
                generateSOSId();


            const session = {

                sosId,

                userSocketId:
                    socket.id,

                responderSocketId:
                    assignedResponder,

                startedAt:
                    Date.now(),

                status:
                    "ACTIVE"

            };


            activeSessions.set(
                sosId,
                session
            );


            userSessions.set(
                socket.id,
                sosId
            );


            responderSessions.set(
                assignedResponder,
                sosId
            );


            // ---------------------------------
            // USER CONFIRMATION
            // ---------------------------------

            socket.emit(
                "responder-assigned",
                {
                    sosId
                }
            );


            // ---------------------------------
            // RESPONDER NOTIFICATION
            // ---------------------------------

            io.to(
                assignedResponder
            ).emit(
                "incoming-sos",
                {
                    sosId,
                    startedAt:
                        session.startedAt
                }
            );


            console.log(
                "================================="
            );

            console.log(
                "🚨 SECURE SOS SESSION CREATED"
            );

            console.log(
                `SOS       : ${sosId}`
            );

            console.log(
                `USER      : ${socket.id}`
            );

            console.log(
                `RESPONDER : ${assignedResponder}`
            );

            console.log(
                "================================="
            );

        }
    );


    // =================================
    // UNAUTHORIZED MANUAL JOIN
    // =================================

    socket.on(
        "join-sos",
        ({ sosId } = {}) => {

            console.warn(
                `🚫 MANUAL JOIN ATTEMPT: ${socket.id}`
            );


            if (
                socket.role !== "responder"
            ) {

                socket.emit(
                    "join-denied",
                    {
                        reason:
                            "Only responders can join SOS sessions."
                    }
                );

                return;
            }


            const session =
                activeSessions.get(
                    sosId
                );


            if (!session) {

                socket.emit(
                    "join-denied",
                    {
                        reason:
                            "SOS session does not exist."
                    }
                );

                return;
            }


            // ---------------------------------
            // ONLY ASSIGNED RESPONDER
            // ---------------------------------

            if (
                session.responderSocketId !==
                socket.id
            ) {

                console.warn(
                    `🚫 UNAUTHORIZED RESPONDER BLOCKED: ${socket.id}`
                );

                socket.emit(
                    "join-denied",
                    {
                        reason:
                            "You are not authorized for this emergency."
                    }
                );

                return;
            }


            // ---------------------------------
            // AUTHORIZED
            // ---------------------------------

            responderSessions.set(
                socket.id,
                sosId
            );


            socket.emit(
                "join-approved",
                {
                    sosId
                }
            );


            console.log(
                `✅ AUTHORIZED RESPONDER JOIN: ${socket.id}`
            );

        }
    );


    // =================================
    // WEBRTC OFFER
    // USER → RESPONDER
    // =================================

    socket.on(
        "webrtc-offer",
        ({ offer } = {}) => {

            const session =
                getUserSession(
                    socket
                );


            if (
                !isAuthorizedUser(
                    socket,
                    session
                )
            ) {

                console.warn(
                    `🚫 UNAUTHORIZED WEBRTC OFFER: ${socket.id}`
                );

                return;
            }


            if (!offer) {
                return;
            }


            console.log(
                `📤 WEBRTC OFFER: ${socket.id} → ${session.responderSocketId}`
            );


            io.to(
                session.responderSocketId
            ).emit(
                "webrtc-offer",
                {
                    offer,
                    sosId:
                        session.sosId
                }
            );

        }
    );


    // =================================
    // WEBRTC ANSWER
    // RESPONDER → USER
    // =================================

    socket.on(
        "webrtc-answer",
        ({ answer } = {}) => {

            const session =
                getResponderSession(
                    socket
                );


            if (
                !isAuthorizedResponder(
                    socket,
                    session
                )
            ) {

                console.warn(
                    `🚫 UNAUTHORIZED WEBRTC ANSWER: ${socket.id}`
                );

                return;
            }


            if (!answer) {
                return;
            }


            console.log(
                `📤 WEBRTC ANSWER: ${socket.id} → ${session.userSocketId}`
            );


            io.to(
                session.userSocketId
            ).emit(
                "webrtc-answer",
                {
                    answer,
                    sosId:
                        session.sosId
                }
            );

        }
    );


    // =================================
    // WEBRTC ICE CANDIDATE
    // =================================

    socket.on(
        "webrtc-ice-candidate",
        ({ candidate } = {}) => {

            if (!candidate) {
                return;
            }


            // ---------------------------------
            // USER → RESPONDER
            // ---------------------------------

            const userSession =
                getUserSession(
                    socket
                );


            if (
                isAuthorizedUser(
                    socket,
                    userSession
                )
            ) {

                io.to(
                    userSession.responderSocketId
                ).emit(
                    "webrtc-ice-candidate",
                    {
                        candidate,
                        sosId:
                            userSession.sosId
                    }
                );

                return;
            }


            // ---------------------------------
            // RESPONDER → USER
            // ---------------------------------

            const responderSession =
                getResponderSession(
                    socket
                );


            if (
                isAuthorizedResponder(
                    socket,
                    responderSession
                )
            ) {

                io.to(
                    responderSession.userSocketId
                ).emit(
                    "webrtc-ice-candidate",
                    {
                        candidate,
                        sosId:
                            responderSession.sosId
                    }
                );

                return;
            }


            console.warn(
                `🚫 UNAUTHORIZED ICE CANDIDATE: ${socket.id}`
            );

        }
    );


    // =================================
    // LIVE LOCATION
    // USER → ASSIGNED RESPONDER
    // =================================

    socket.on(
        "location-update",
        ({
            latitude,
            longitude
        } = {}) => {

            const session =
                getUserSession(
                    socket
                );


            if (
                !isAuthorizedUser(
                    socket,
                    session
                )
            ) {

                console.warn(
                    `🚫 UNAUTHORIZED LOCATION UPDATE: ${socket.id}`
                );

                return;
            }


            if (
                typeof latitude !== "number" ||
                typeof longitude !== "number"
            ) {

                return;
            }


            if (
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {

                return;
            }


            io.to(
                session.responderSocketId
            ).emit(
                "location-update",
                {
                    latitude,
                    longitude,
                    timestamp:
                        Date.now(),
                    sosId:
                        session.sosId
                }
            );

        }
    );


    // =================================
    // USER CANCEL ATTEMPT
    // =================================
    //
    // USER IS NOT ALLOWED TO END SOS.
    //
    // We intentionally do NOT delete
    // the session here.
    //

    socket.on(
        "sos-cancel",
        () => {

            console.warn(
                `⚠️ USER CANCEL ATTEMPT BLOCKED: ${socket.id}`
            );


            socket.emit(
                "cancel-denied",
                {
                    reason:
                        "Active emergency can only be resolved by the assigned responder."
                }
            );

        }
    );


    // =================================
    // RESPONDER RESOLVES SOS
    // =================================

    socket.on(
        "sos-resolve",
        () => {

            const session =
                getResponderSession(
                    socket
                );


            if (
                !isAuthorizedResponder(
                    socket,
                    session
                )
            ) {

                console.warn(
                    `🚫 UNAUTHORIZED RESOLVE ATTEMPT: ${socket.id}`
                );

                return;
            }


            console.log(
                `✅ SOS RESOLVED: ${session.sosId}`
            );


            // ---------------------------------
            // USER NOTIFICATION
            // ---------------------------------

            io.to(
                session.userSocketId
            ).emit(
                "sos-status",
                {
                    status:
                        "RESOLVED"
                }
            );


            io.to(
                session.userSocketId
            ).emit(
                "responder-status",
                {
                    status:
                        "resolved"
                }
            );


            // ---------------------------------
            // RESPONDER NOTIFICATION
            // ---------------------------------

            socket.emit(
                "sos-status",
                {
                    status:
                        "RESOLVED"
                }
            );


            // ---------------------------------
            // CLEAN SESSION
            // ---------------------------------

            activeSessions.delete(
                session.sosId
            );

            userSessions.delete(
                session.userSocketId
            );

            responderSessions.delete(
                socket.id
            );

        }
    );


    // =================================
    // DISCONNECT
    // =================================

    socket.on(
        "disconnect",
        () => {

            console.log(
                `🔴 Socket disconnected: ${socket.id}`
            );


            // ---------------------------------
            // RESPONDER DISCONNECTED
            // ---------------------------------

            if (
                responders.has(
                    socket.id
                )
            ) {

                responders.delete(
                    socket.id
                );


                const sosId =
                    responderSessions.get(
                        socket.id
                    );


                if (sosId) {

                    const session =
                        activeSessions.get(
                            sosId
                        );


                    if (session) {

                        io.to(
                            session.userSocketId
                        ).emit(
                            "responder-status",
                            {
                                status:
                                    "disconnected"
                            }
                        );


                        io.to(
                            session.userSocketId
                        ).emit(
                            "responder-unavailable"
                        );


                        /*
                         * IMPORTANT:
                         *
                         * We don't silently convert the
                         * emergency into a normal state.
                         *
                         * The active emergency remains
                         * tracked until explicitly handled.
                         */

                    }

                }

            }


            // ---------------------------------
            // USER DISCONNECTED
            // ---------------------------------

            const userSosId =
                userSessions.get(
                    socket.id
                );


            if (userSosId) {

                const session =
                    activeSessions.get(
                        userSosId
                    );


                if (session) {

                    io.to(
                        session.responderSocketId
                    ).emit(
                        "sos-status",
                        {
                            status:
                                "USER_DISCONNECTED"
                        }
                    );

                }

            }

        }
    );

});

// =====================================
// START SERVER
// =====================================

server.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            "🚨 SOS GUARDIAN BACKEND"
        );

        console.log(
            "================================="
        );

        console.log(
            `🚀 Server running on port ${PORT}`
        );

        console.log(
            `🌐 http://localhost:${PORT}`
        );

        console.log(
            "📡 Socket.IO ready"
        );

        console.log(
            "🔗 Automatic SOS assignment ready"
        );

        console.log(
            "📹 WebRTC signaling ready"
        );

        console.log(
            "📍 Location signaling ready"
        );

        console.log(
            "🔐 Session authorization enabled"
        );

        console.log(
            "🛡️ Security validation enabled"
        );

        console.log(
            "================================="
        );

    }
);