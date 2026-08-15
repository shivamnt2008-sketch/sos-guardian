// =====================================
// SOS GUARDIAN — RESPONDER APP
// Secure WebRTC + Live Location
// =====================================

const socket = io("https://sos-guardian-backend.onrender.com");

let sosId = null;
let peerConnection = null;

let joined = false;
let sessionAuthorized = false;
let emergencyActive = false;

// =====================================
// WEBRTC QUEUES
// =====================================

// Sometimes WebRTC offer arrives before
// server sends join-approved.
// We keep it temporarily instead of dropping it.

let pendingOffer = null;
let pendingIceCandidates = [];


// =====================================
// RTC CONFIG
// =====================================

const RTC_CONFIG = {

    iceServers: [

        {
            urls: "stun:stun.l.google.com:19302"
        }

    ]

};


// =====================================
// ELEMENTS
// =====================================

const connectionStatus =
    document.getElementById("connectionStatus");

const sosTitle =
    document.getElementById("sosTitle");

const sosIndicator =
    document.getElementById("sosIndicator");

const joinPanel =
    document.getElementById("joinPanel");

const activeSession =
    document.getElementById("activeSession");

const sosIdInput =
    document.getElementById("sosIdInput");

const joinButton =
    document.getElementById("joinButton");

const sosIdDisplay =
    document.getElementById("sosIdDisplay");

const responderStatus =
    document.getElementById("responderStatus");

const remoteVideo =
    document.getElementById("remoteVideo");

const videoPlaceholder =
    document.getElementById("videoPlaceholder");

const liveBadge =
    document.getElementById("liveBadge");

const mediaStatus =
    document.getElementById("mediaStatus");

const locationStatus =
    document.getElementById("locationStatus");

const coordinates =
    document.getElementById("coordinates");

const mapLink =
    document.getElementById("mapLink");

const resolveButton =
    document.getElementById("resolveButton");


// =====================================
// INITIAL STATE
// =====================================

function resetUI() {

    joined = false;

    sessionAuthorized = false;

    emergencyActive = false;

    sosId = null;

    pendingOffer = null;

    pendingIceCandidates = [];


    if (joinPanel) {

        joinPanel.classList.remove(
            "hidden"
        );
    }


    if (activeSession) {

        activeSession.classList.add(
            "hidden"
        );
    }


    if (sosIndicator) {

        sosIndicator.classList.add(
            "hidden"
        );
    }


    if (resolveButton) {

        resolveButton.disabled = true;
    }


    if (mediaStatus) {

        mediaStatus.textContent =
            "Waiting";
    }


    if (locationStatus) {

        locationStatus.textContent =
            "Waiting";
    }


    if (coordinates) {

        coordinates.textContent =
            "Waiting for location...";
    }


    if (mapLink) {

        mapLink.removeAttribute(
            "href"
        );

        mapLink.classList.add(
            "disabled"
        );
    }


    if (videoPlaceholder) {

        videoPlaceholder.classList.remove(
            "hidden"
        );
    }


    if (liveBadge) {

        liveBadge.classList.add(
            "hidden"
        );
    }


    if (remoteVideo) {

        remoteVideo.srcObject = null;
    }
}


resetUI();


// =====================================
// SOCKET CONNECTION
// =====================================

socket.on(
    "connect",
    () => {

        console.log(
            "🟢 RESPONDER SOCKET CONNECTED:",
            socket.id
        );


        if (connectionStatus) {

            connectionStatus.textContent =
                "● Connected";

            connectionStatus.classList.remove(
                "offline"
            );

            connectionStatus.classList.add(
                "online"
            );
        }


        if (responderStatus) {

            responderStatus.textContent =
                "Registering responder...";
        }


        // =================================
        // REGISTER RESPONDER
        // =================================

        socket.emit(
            "responder-online"
        );


        console.log(
            "👮 RESPONDER ONLINE SENT"
        );
    }
);


// =====================================
// RESPONDER READY
// =====================================

socket.on(
    "responder-ready",
    () => {

        console.log(
            "✅ RESPONDER AUTHORIZED / READY"
        );


        if (responderStatus) {

            responderStatus.textContent =
                "Responder ready — waiting for SOS";
        }
    }
);


// =====================================
// SOCKET DISCONNECT
// =====================================

socket.on(
    "disconnect",
    () => {

        console.log(
            "🔴 RESPONDER SOCKET DISCONNECTED"
        );


        if (connectionStatus) {

            connectionStatus.textContent =
                "● Offline";

            connectionStatus.classList.remove(
                "online"
            );

            connectionStatus.classList.add(
                "offline"
            );
        }


        if (responderStatus) {

            responderStatus.textContent =
                "Disconnected from server";
        }


        sessionAuthorized = false;


        if (resolveButton) {

            resolveButton.disabled =
                true;
        }
    }
);


// =====================================
// INCOMING SOS
// =====================================

socket.on(
    "incoming-sos",
    ({
        sosId: incomingSOSId,
        startedAt
    } = {}) => {

        console.log(
            "🚨 INCOMING SOS RECEIVED:",
            incomingSOSId
        );


        if (!incomingSOSId) {

            console.error(
                "❌ SERVER SENT INVALID SOS ID"
            );

            return;
        }


        // =================================
        // PREVENT REPLACING ACTIVE SOS
        // =================================

        if (
            emergencyActive &&
            sessionAuthorized
        ) {

            console.warn(
                "⚠️ ALREADY HANDLING ACTIVE SOS"
            );

            return;
        }


        // =================================
        // SET SESSION
        // =================================

        sosId =
            String(incomingSOSId);

        emergencyActive = true;

        joined = false;

        sessionAuthorized = false;


        // Clear old WebRTC data

        pendingOffer = null;

        pendingIceCandidates = [];


        // =================================
        // UI
        // =================================

        if (sosTitle) {

            sosTitle.textContent =
                "Incoming Emergency";
        }


        if (sosIndicator) {

            sosIndicator.classList.remove(
                "hidden"
            );
        }


        if (joinPanel) {

            joinPanel.classList.add(
                "hidden"
            );
        }


        if (activeSession) {

            activeSession.classList.remove(
                "hidden"
            );
        }


        if (sosIdDisplay) {

            sosIdDisplay.textContent =
                sosId;
        }


        if (responderStatus) {

            responderStatus.textContent =
                "Emergency assigned — authorizing session...";
        }


        if (mediaStatus) {

            mediaStatus.textContent =
                "Authorizing";
        }


        console.log(
            "🔐 REQUESTING SERVER SESSION AUTHORIZATION"
        );


        // =================================
        // REQUEST AUTHORIZED JOIN
        // =================================

        socket.emit(
            "join-sos",
            {
                sosId
            }
        );
    }
);


// =====================================
// JOIN APPROVED
// =====================================

socket.on(
    "join-approved",
    async ({
        sosId: approvedSOSId
    } = {}) => {

        console.log(
            "🔐 JOIN APPROVED:",
            approvedSOSId
        );


        if (!approvedSOSId) {

            console.error(
                "❌ JOIN APPROVED WITHOUT SOS ID"
            );

            return;
        }


        // =================================
        // SECURITY CHECK
        // =================================

        if (
            sosId &&
            String(approvedSOSId) !==
            String(sosId)
        ) {

            console.error(
                "🚫 SOS ID MISMATCH"
            );

            sessionAuthorized =
                false;

            return;
        }


        sosId =
            String(approvedSOSId);


        joined = true;

        sessionAuthorized = true;

        emergencyActive = true;


        // =================================
        // UI
        // =================================

        if (sosTitle) {

            sosTitle.textContent =
                "Emergency Session Active";
        }


        if (sosIndicator) {

            sosIndicator.classList.remove(
                "hidden"
            );
        }


        if (joinPanel) {

            joinPanel.classList.add(
                "hidden"
            );
        }


        if (activeSession) {

            activeSession.classList.remove(
                "hidden"
            );
        }


        if (sosIdDisplay) {

            sosIdDisplay.textContent =
                sosId;
        }


        if (responderStatus) {

            responderStatus.textContent =
                "Authorized responder";
        }


        if (mediaStatus) {

            mediaStatus.textContent =
                "Waiting for user camera";
        }


        console.log(
            "✅ AUTHORIZED SOS SESSION ACTIVE"
        );


        // =================================
        // PROCESS QUEUED OFFER
        // =================================

        if (pendingOffer) {

            console.log(
                "📦 PROCESSING QUEUED WEBRTC OFFER"
            );


            const queuedOffer =
                pendingOffer;


            pendingOffer = null;


            await handleWebRTCOffer(
                queuedOffer.offer,
                queuedOffer.offerSOSId
            );
        }


        // =================================
        // PROCESS QUEUED ICE
        // =================================

        await flushPendingIceCandidates();
    }
);


// =====================================
// JOIN DENIED
// =====================================

socket.on(
    "join-denied",
    ({
        reason
    } = {}) => {

        console.warn(
            "🚫 SOS JOIN DENIED:",
            reason
        );


        joined = false;

        sessionAuthorized = false;

        emergencyActive = false;


        pendingOffer = null;

        pendingIceCandidates = [];


        if (responderStatus) {

            responderStatus.textContent =
                reason ||
                "SOS session authorization denied";
        }


        if (mediaStatus) {

            mediaStatus.textContent =
                "Access denied";
        }


        if (sosTitle) {

            sosTitle.textContent =
                "Access Denied";
        }


        if (sosIndicator) {

            sosIndicator.classList.add(
                "hidden"
            );
        }


        if (resolveButton) {

            resolveButton.disabled =
                true;
        }


        if (joinPanel) {

            joinPanel.classList.remove(
                "hidden"
            );
        }


        if (activeSession) {

            activeSession.classList.add(
                "hidden"
            );
        }


        sosId = null;
    }
);


// =====================================
// MANUAL JOIN
// =====================================

if (joinButton) {

    joinButton.addEventListener(
        "click",
        manualJoinSOS
    );
}


if (sosIdInput) {

    sosIdInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                manualJoinSOS();
            }
        }
    );
}


function manualJoinSOS() {

    if (sessionAuthorized) {

        console.warn(
            "⚠️ ALREADY AUTHORIZED FOR AN SOS"
        );

        return;
    }


    const enteredSOSId =
        sosIdInput
            ? sosIdInput.value.trim()
            : "";


    if (!enteredSOSId) {

        alert(
            "Enter a valid SOS ID."
        );

        return;
    }


    console.log(
        "🔐 MANUAL AUTHORIZATION REQUEST:",
        enteredSOSId
    );


    sosId =
        enteredSOSId;


    if (responderStatus) {

        responderStatus.textContent =
            "Validating SOS session...";
    }


    socket.emit(
        "join-sos",
        {
            sosId
        }
    );
}


// =====================================
// WEBRTC OFFER RECEIVED
// USER → RESPONDER
// =====================================

socket.on(
    "webrtc-offer",
    async ({
        offer,
        sosId: offerSOSId
    } = {}) => {

        console.log(
            "📥 WEBRTC OFFER RECEIVED"
        );


        if (!offer) {

            console.warn(
                "⚠️ EMPTY WEBRTC OFFER"
            );

            return;
        }


        // =================================
        // IMPORTANT RACE-CONDITION FIX
        // =================================
        //
        // Offer may arrive before
        // join-approved.
        //
        // DO NOT DROP IT.
        //

        if (!sessionAuthorized) {

            console.log(
                "📦 WEBRTC OFFER QUEUED — WAITING FOR AUTHORIZATION"
            );


            pendingOffer = {

                offer,

                offerSOSId

            };


            return;
        }


        await handleWebRTCOffer(
            offer,
            offerSOSId
        );
    }
);


// =====================================
// HANDLE WEBRTC OFFER
// =====================================

async function handleWebRTCOffer(
    offer,
    offerSOSId
) {

    console.log(
        "🔐 PROCESSING AUTHORIZED WEBRTC OFFER"
    );


    // =================================
    // SECURITY
    // =================================

    if (!sessionAuthorized) {

        console.warn(
            "🚫 OFFER BLOCKED — NOT AUTHORIZED"
        );

        return;
    }


    if (
        offerSOSId &&
        String(offerSOSId) !==
        String(sosId)
    ) {

        console.warn(
            "🚫 WEBRTC OFFER BLOCKED — SOS ID MISMATCH"
        );

        return;
    }


    if (!offer) {

        console.warn(
            "⚠️ EMPTY WEBRTC OFFER"
        );

        return;
    }


    try {

        // =================================
        // CREATE PEER
        // =================================

        await createPeerConnection();


        // =================================
        // SET USER OFFER
        // =================================

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                offer
            )
        );


        console.log(
            "✅ USER OFFER SET"
        );


        // =================================
        // CREATE ANSWER
        // =================================

        const answer =
            await peerConnection.createAnswer();


        await peerConnection.setLocalDescription(
            answer
        );


        // =================================
        // SEND ANSWER
        // =================================

        socket.emit(
            "webrtc-answer",
            {
                answer
            }
        );


        console.log(
            "📤 WEBRTC ANSWER SENT"
        );


        if (responderStatus) {

            responderStatus.textContent =
                "Connecting to emergency user...";
        }


        // =================================
        // PROCESS ICE THAT ARRIVED
        // BEFORE PEER EXISTED
        // =================================

        await flushPendingIceCandidates();

    } catch (error) {

        console.error(
            "❌ WEBRTC OFFER ERROR:",
            error
        );


        if (responderStatus) {

            responderStatus.textContent =
                "WebRTC connection error";
        }
    }
}


// =====================================
// WEBRTC ICE
// =====================================

socket.on(
    "webrtc-ice-candidate",
    async ({
        candidate,
        sosId: candidateSOSId
    } = {}) => {

        if (!candidate) {

            return;
        }


        // =================================
        // QUEUE BEFORE AUTHORIZATION
        // =================================

        if (!sessionAuthorized) {

            console.log(
                "📦 ICE QUEUED — WAITING FOR AUTHORIZATION"
            );


            pendingIceCandidates.push({

                candidate,

                candidateSOSId

            });


            return;
        }


        // =================================
        // QUEUE IF PEER NOT READY
        // =================================

        if (!peerConnection) {

            console.log(
                "📦 ICE QUEUED — PEER NOT READY"
            );


            pendingIceCandidates.push({

                candidate,

                candidateSOSId

            });


            return;
        }


        await handleRemoteIceCandidate(
            candidate,
            candidateSOSId
        );
    }
);


// =====================================
// HANDLE REMOTE ICE
// =====================================

async function handleRemoteIceCandidate(
    candidate,
    candidateSOSId
) {

    if (!sessionAuthorized) {

        console.warn(
            "🚫 ICE BLOCKED — SESSION NOT AUTHORIZED"
        );

        return;
    }


    if (
        candidateSOSId &&
        String(candidateSOSId) !==
        String(sosId)
    ) {

        console.warn(
            "🚫 ICE BLOCKED — SOS ID MISMATCH"
        );

        return;
    }


    if (!peerConnection) {

        console.log(
            "📦 ICE QUEUED — PEER CONNECTION NOT READY"
        );


        pendingIceCandidates.push({

            candidate,

            candidateSOSId

        });


        return;
    }


    try {

        await peerConnection.addIceCandidate(
            new RTCIceCandidate(
                candidate
            )
        );


        console.log(
            "🧊 RESPONDER ICE ADDED"
        );

    } catch (error) {

        console.error(
            "❌ RESPONDER ICE ERROR:",
            error
        );
    }
}


// =====================================
// FLUSH PENDING ICE
// =====================================

async function flushPendingIceCandidates() {

    if (
        !sessionAuthorized ||
        !peerConnection
    ) {

        return;
    }


    if (
        pendingIceCandidates.length === 0
    ) {

        return;
    }


    console.log(
        "📦 PROCESSING QUEUED ICE CANDIDATES:",
        pendingIceCandidates.length
    );


    const candidates =
        [...pendingIceCandidates];


    pendingIceCandidates = [];


    for (
        const item
        of candidates
    ) {

        await handleRemoteIceCandidate(
            item.candidate,
            item.candidateSOSId
        );
    }
}


// =====================================
// CREATE PEER CONNECTION
// =====================================

async function createPeerConnection() {

    if (!sessionAuthorized) {

        throw new Error(
            "SOS session is not authorized."
        );
    }


    // =================================
    // CLOSE OLD CONNECTION
    // =================================

    if (peerConnection) {

        try {

            peerConnection.close();

        } catch (error) {

            console.warn(
                "⚠️ OLD PEER CLOSE ERROR:",
                error
            );
        }


        peerConnection = null;
    }


    // =================================
    // CREATE NEW PEER
    // =================================

    peerConnection =
        new RTCPeerConnection(
            RTC_CONFIG
        );


    console.log(
        "🔗 AUTHORIZED PEER CONNECTION CREATED"
    );


    // =================================
    // REMOTE MEDIA
    // =================================

    peerConnection.ontrack =
        event => {

            console.log(
                "📡 REMOTE TRACK RECEIVED:",
                event.track.kind
            );


            // =================================
            // VIDEO / AUDIO STREAM
            // =================================

            if (
                event.streams &&
                event.streams[0]
            ) {

                const stream =
                    event.streams[0];


                console.log(
                    "📡 REMOTE STREAM RECEIVED:",
                    stream
                        .getTracks()
                        .map(
                            track =>
                                track.kind
                        )
                );


                if (remoteVideo) {

                    remoteVideo.srcObject =
                        stream;


                    remoteVideo.autoplay =
                        true;


                    remoteVideo.playsInline =
                        true;


                    // We mute only to guarantee
                    // autoplay of the video.
                    // Audio track still exists
                    // in the MediaStream.

                    remoteVideo.muted =
                        false;


                    remoteVideo
                        .play()
                        .then(
                            () => {

                                console.log(
                                    "📹 REMOTE VIDEO PLAYING"
                                );
                            }
                        )
                        .catch(
                            error => {

                                console.warn(
                                    "⚠️ VIDEO AUTOPLAY BLOCKED:",
                                    error
                                );


                                // Try muted autoplay
                                // if browser blocks audio.

                                if (
                                    remoteVideo
                                ) {

                                    remoteVideo.muted =
                                        true;


                                    remoteVideo
                                        .play()
                                        .then(
                                            () => {

                                                console.log(
                                                    "📹 REMOTE VIDEO PLAYING MUTED"
                                                );
                                            }
                                        )
                                        .catch(
                                            playError => {

                                                console.warn(
                                                    "⚠️ VIDEO PLAY FAILED:",
                                                    playError
                                                );
                                            }
                                        );
                                }
                            }
                        );
                }
            }


            // =================================
            // UI
            // =================================

            if (videoPlaceholder) {

                videoPlaceholder.classList.add(
                    "hidden"
                );
            }


            if (liveBadge) {

                liveBadge.classList.remove(
                    "hidden"
                );
            }


            if (mediaStatus) {

                mediaStatus.textContent =
                    "LIVE";
            }


            if (responderStatus) {

                responderStatus.textContent =
                    "Live emergency stream";
            }


            if (resolveButton) {

                resolveButton.disabled =
                    false;
            }
        };


    // =================================
    // ICE
    // =================================

    peerConnection.onicecandidate =
        event => {

            if (
                !event.candidate ||
                !sessionAuthorized
            ) {

                return;
            }


            socket.emit(
                "webrtc-ice-candidate",
                {
                    candidate:
                        event.candidate
                }
            );


            console.log(
                "🧊 RESPONDER ICE SENT"
            );
        };


    // =================================
    // CONNECTION STATE
    // =================================

    peerConnection.onconnectionstatechange =
        () => {

            if (!peerConnection) {

                return;
            }


            const state =
                peerConnection.connectionState;


            console.log(
                "RESPONDER WEBRTC STATE:",
                state
            );


            // =================================
            // CONNECTING
            // =================================

            if (
                state === "connecting"
            ) {

                if (responderStatus) {

                    responderStatus.textContent =
                        "Connecting to user...";
                }
            }


            // =================================
            // CONNECTED
            // =================================

            if (
                state === "connected"
            ) {

                if (responderStatus) {

                    responderStatus.textContent =
                        "Live connection active";
                }


                if (mediaStatus) {

                    mediaStatus.textContent =
                        "LIVE";
                }


                if (resolveButton) {

                    resolveButton.disabled =
                        false;
                }


                console.log(
                    "🟢 AUTHORIZED WEBRTC CONNECTED"
                );
            }


            // =================================
            // DISCONNECTED
            // =================================

            if (
                state === "disconnected"
            ) {

                if (responderStatus) {

                    responderStatus.textContent =
                        "User connection interrupted";
                }
            }


            // =================================
            // FAILED
            // =================================

            if (
                state === "failed"
            ) {

                if (responderStatus) {

                    responderStatus.textContent =
                        "WebRTC connection failed";
                }


                if (mediaStatus) {

                    mediaStatus.textContent =
                        "Connection failed";
                }


                console.error(
                    "❌ WEBRTC CONNECTION FAILED"
                );
            }


            // =================================
            // CLOSED
            // =================================

            if (
                state === "closed"
            ) {

                if (responderStatus) {

                    responderStatus.textContent =
                        "Connection closed";
                }
            }
        };
}


// =====================================
// LIVE LOCATION
// =====================================

socket.on(
    "location-update",
    ({
        latitude,
        longitude,
        timestamp,
        sosId: locationSOSId
    } = {}) => {

        // =================================
        // SECURITY
        // =================================

        if (!sessionAuthorized) {

            console.warn(
                "🚫 LOCATION BLOCKED — SESSION NOT AUTHORIZED"
            );

            return;
        }


        if (
            locationSOSId &&
            String(locationSOSId) !==
            String(sosId)
        ) {

            console.warn(
                "🚫 LOCATION BLOCKED — SOS ID MISMATCH"
            );

            return;
        }


        const lat =
            Number(latitude);

        const lng =
            Number(longitude);


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return;
        }


        if (
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
        ) {

            return;
        }


        console.log(
            "📍 AUTHORIZED LIVE LOCATION:",
            lat,
            lng
        );


        if (coordinates) {

            coordinates.textContent =
                `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }


        if (locationStatus) {

            locationStatus.textContent =
                "LIVE";
        }


        const mapsURL =
            `https://www.google.com/maps?q=${lat},${lng}`;


        if (mapLink) {

            mapLink.href =
                mapsURL;

            mapLink.classList.remove(
                "disabled"
            );
        }
    }
);


// =====================================
// SOS STATUS
// =====================================

socket.on(
    "sos-status",
    ({
        status
    } = {}) => {

        console.log(
            "🚨 SOS STATUS:",
            status
        );


        if (
            status === "RESOLVED"
        ) {

            finishEmergency(
                "Emergency resolved by responder"
            );

            return;
        }


        if (
            status === "CANCELLED"
        ) {

            if (responderStatus) {

                responderStatus.textContent =
                    "Emergency cancelled";
            }

            return;
        }


        if (
            status === "USER_DISCONNECTED"
        ) {

            if (responderStatus) {

                responderStatus.textContent =
                    "Emergency user disconnected";
            }


            if (mediaStatus) {

                mediaStatus.textContent =
                    "User disconnected";
            }
        }
    }
);


// =====================================
// RESPONDER STATUS
// =====================================

socket.on(
    "responder-status",
    ({
        status
    } = {}) => {

        console.log(
            "👮 RESPONDER STATUS:",
            status
        );


        if (
            status === "disconnected"
        ) {

            if (responderStatus) {

                responderStatus.textContent =
                    "Responder connection interrupted";
            }


            return;
        }


        if (
            status === "resolved"
        ) {

            finishEmergency(
                "Emergency resolved by responder"
            );
        }
    }
);


// =====================================
// RESOLVE EMERGENCY
// =====================================

if (resolveButton) {

    resolveButton.addEventListener(
        "click",
        resolveEmergency
    );
}


function resolveEmergency() {

    // =================================
    // SECURITY
    // =================================

    if (!sessionAuthorized) {

        console.warn(
            "🚫 RESOLVE BLOCKED — SESSION NOT AUTHORIZED"
        );

        return;
    }


    if (!sosId) {

        console.warn(
            "🚫 RESOLVE BLOCKED — NO SOS ID"
        );

        return;
    }


    if (!emergencyActive) {

        return;
    }


    const confirmed =
        confirm(
            "Are you sure you want to resolve this emergency?"
        );


    if (!confirmed) {

        return;
    }


    console.log(
        "📤 AUTHORIZED SOS RESOLVE REQUEST:",
        sosId
    );


    if (resolveButton) {

        resolveButton.disabled =
            true;
    }


    if (responderStatus) {

        responderStatus.textContent =
            "Resolving emergency...";
    }


    socket.emit(
        "sos-resolve"
    );
}


// =====================================
// FINISH EMERGENCY
// =====================================

function finishEmergency(
    message = "Emergency resolved"
) {

    console.log(
        "✅ EMERGENCY FINISHED"
    );


    emergencyActive = false;

    joined = false;

    sessionAuthorized = false;


    // =================================
    // CLEAR WEBRTC QUEUES
    // =================================

    pendingOffer = null;

    pendingIceCandidates = [];


    // =================================
    // STOP REMOTE MEDIA
    // =================================

    if (
        remoteVideo &&
        remoteVideo.srcObject
    ) {

        remoteVideo
            .srcObject
            .getTracks()
            .forEach(
                track => {

                    track.stop();
                }
            );


        remoteVideo.srcObject =
            null;
    }


    // =================================
    // CLOSE PEER
    // =================================

    if (peerConnection) {

        try {

            peerConnection.close();

        } catch (error) {

            console.warn(
                "⚠️ PEER CLOSE ERROR:",
                error
            );
        }


        peerConnection = null;
    }


    // =================================
    // UI
    // =================================

    if (videoPlaceholder) {

        videoPlaceholder.classList.remove(
            "hidden"
        );
    }


    if (liveBadge) {

        liveBadge.classList.add(
            "hidden"
        );
    }


    if (mediaStatus) {

        mediaStatus.textContent =
            "Ended";
    }


    if (locationStatus) {

        locationStatus.textContent =
            "Emergency ended";
    }


    if (coordinates) {

        coordinates.textContent =
            "Emergency session ended";
    }


    if (mapLink) {

        mapLink.removeAttribute(
            "href"
        );

        mapLink.classList.add(
            "disabled"
        );
    }


    if (resolveButton) {

        resolveButton.disabled =
            true;
    }


    if (sosIndicator) {

        sosIndicator.classList.add(
            "hidden"
        );
    }


    if (sosTitle) {

        sosTitle.textContent =
            "Emergency Resolved";
    }


    if (responderStatus) {

        responderStatus.textContent =
            message;
    }


    // =================================
    // CLEAR SESSION
    // =================================

    sosId = null;


    // =================================
    // WAITING STATE
    // =================================

    if (joinPanel) {

        joinPanel.classList.remove(
            "hidden"
        );
    }


    if (activeSession) {

        activeSession.classList.add(
            "hidden"
        );
    }


    if (sosIdInput) {

        sosIdInput.value =
            "";
    }
}


// =====================================
// PAGE ERROR PROTECTION
// =====================================

window.addEventListener(
    "beforeunload",
    () => {

        if (peerConnection) {

            peerConnection.close();
        }
    }
);


// =====================================
// APP LOADED
// =====================================

console.log(
    "🛡️ SECURE RESPONDER APP LOADED"
);