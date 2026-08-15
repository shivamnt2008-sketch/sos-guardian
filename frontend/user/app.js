// ============================================================
// SOS GUARDIAN — USER APP
// ============================================================

// ============================================================
// SOCKET.IO
// ============================================================

const socket = io("https://sos-guardian-backend.onrender.com");


// ============================================================
// GLOBAL STATE
// ============================================================

let sosActive = false;
let emergencyLocked = false;

let localStream = null;
let peerConnection = null;
let locationWatchId = null;

let wakeLock = null;

// ICE candidates received before remote description
let pendingIceCandidates = [];


// ============================================================
// WEBRTC CONFIG
// ============================================================

const RTC_CONFIG = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};


// ============================================================
// ELEMENTS
// ============================================================

const sosButton =
    document.getElementById("sosButton");

const cancelButton =
    document.getElementById("cancelButton");

const connectionStatus =
    document.getElementById("connectionStatus");

const sosStatus =
    document.getElementById("sosStatus");

const activeSOS =
    document.getElementById("activeSOS");

const locationStatus =
    document.getElementById("locationStatus");

const cameraStatus =
    document.getElementById("cameraStatus");

const audioStatus =
    document.getElementById("audioStatus");

const responderStatus =
    document.getElementById("responderStatus");


// ============================================================
// STATUS ITEMS
// ============================================================

const statusItems = {

    location:
        locationStatus?.closest(".status-item"),

    camera:
        cameraStatus?.closest(".status-item"),

    audio:
        audioStatus?.closest(".status-item"),

    responder:
        responderStatus?.closest(".status-item")
};


// ============================================================
// INDICATOR HELPER
// ============================================================

function setIndicator(type, state, message) {

    const item = statusItems[type];

    const statusElement = {

        location: locationStatus,
        camera: cameraStatus,
        audio: audioStatus,
        responder: responderStatus

    }[type];

    if (!item || !statusElement) {
        return;
    }

    item.classList.remove(
        "active",
        "waiting",
        "error"
    );

    if (state === "active") {
        item.classList.add("active");
    }

    if (state === "waiting") {
        item.classList.add("waiting");
    }

    if (state === "error") {
        item.classList.add("error");
    }

    statusElement.textContent = message;
}


// ============================================================
// INITIAL STATUS
// ============================================================

setIndicator(
    "location",
    "waiting",
    "Waiting for SOS"
);

setIndicator(
    "camera",
    "waiting",
    "Standby"
);

setIndicator(
    "audio",
    "waiting",
    "Standby"
);

setIndicator(
    "responder",
    "waiting",
    "Not connected"
);


// ============================================================
// SCREEN WAKE LOCK
// ============================================================

async function requestWakeLock() {

    if (!("wakeLock" in navigator)) {

        console.warn(
            "SCREEN WAKE LOCK NOT SUPPORTED"
        );

        return false;
    }

    if (
        !sosActive ||
        document.visibilityState !== "visible"
    ) {
        return false;
    }

    try {

        if (
            wakeLock &&
            !wakeLock.released
        ) {
            return true;
        }

        wakeLock =
            await navigator.wakeLock.request("screen");

        console.log(
            "SCREEN WAKE LOCK ACTIVE"
        );

        wakeLock.addEventListener(
            "release",
            () => {

                console.log(
                    "SCREEN WAKE LOCK RELEASED"
                );

                wakeLock = null;
            }
        );

        return true;

    } catch (error) {

        console.warn(
            "WAKE LOCK REQUEST FAILED:",
            error
        );

        wakeLock = null;

        return false;
    }
}


// ============================================================
// RELEASE WAKE LOCK
// ============================================================

async function releaseWakeLock() {

    if (!wakeLock) {
        return;
    }

    try {

        await wakeLock.release();

        console.log(
            "SCREEN WAKE LOCK RELEASED"
        );

    } catch (error) {

        console.warn(
            "WAKE LOCK RELEASE ERROR:",
            error
        );

    } finally {

        wakeLock = null;
    }
}


// ============================================================
// VISIBILITY CHANGE
// ============================================================

document.addEventListener(
    "visibilitychange",
    async () => {

        if (
            document.visibilityState === "visible" &&
            sosActive
        ) {

            console.log(
                "PAGE VISIBLE — CHECKING WAKE LOCK"
            );

            await requestWakeLock();
        }
    }
);


// ============================================================
// SOCKET CONNECT
// ============================================================

socket.on(
    "connect",
    () => {

        console.log(
            "USER SOCKET CONNECTED:",
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
    }
);


// ============================================================
// SOCKET DISCONNECT
// ============================================================

socket.on(
    "disconnect",
    () => {

        console.log(
            "USER SOCKET DISCONNECTED"
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

        if (sosActive) {

            setIndicator(
                "responder",
                "error",
                "Connection lost"
            );

        } else {

            setIndicator(
                "responder",
                "waiting",
                "Not connected"
            );
        }
    }
);


// ============================================================
// SOS BUTTON
// ============================================================

if (sosButton) {

    sosButton.addEventListener(
        "click",
        async () => {

            if (sosActive) {
                return;
            }

            await startSOS();
        }
    );
}


// ============================================================
// START SOS
// ============================================================

async function startSOS() {

    try {

        console.log(
            "STARTING EMERGENCY"
        );

        sosActive = true;
        emergencyLocked = true;

        pendingIceCandidates = [];


        // ----------------------------------------------------
        // WAKE LOCK
        // ----------------------------------------------------

        await requestWakeLock();


        // ----------------------------------------------------
        // SOS BUTTON
        // ----------------------------------------------------

        if (sosButton) {

            sosButton.disabled = true;

            sosButton.innerHTML = `
                <span>ACTIVE</span>
                <small>EMERGENCY ACTIVE</small>
            `;
        }


        // ----------------------------------------------------
        // SOS STATUS
        // ----------------------------------------------------

        if (sosStatus) {

            sosStatus.textContent =
                "Starting emergency protection...";
        }


        if (activeSOS) {

            activeSOS.classList.remove(
                "hidden"
            );
        }


        // ----------------------------------------------------
        // INITIAL INDICATORS
        // ----------------------------------------------------

        setIndicator(
            "responder",
            "waiting",
            "Finding responder..."
        );

        setIndicator(
            "camera",
            "waiting",
            "Requesting access..."
        );

        setIndicator(
            "audio",
            "waiting",
            "Requesting access..."
        );

        setIndicator(
            "location",
            "waiting",
            "Waiting for location..."
        );


        // ----------------------------------------------------
        // CAMERA + MICROPHONE
        // ----------------------------------------------------

        try {

            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {

                throw new Error(
                    "Camera and microphone are not supported."
                );
            }

            console.log(
                "REQUESTING CAMERA + MICROPHONE"
            );

            localStream =
                await navigator.mediaDevices.getUserMedia({

                    video: {
                        facingMode: "user"
                    },

                    audio: true
                });


            console.log(
                "CAMERA + MICROPHONE READY"
            );


            setIndicator(
                "camera",
                "active",
                "LIVE • Protected"
            );

            setIndicator(
                "audio",
                "active",
                "LIVE • Protected"
            );

        } catch (mediaError) {

            console.error(
                "MEDIA ACCESS ERROR:",
                mediaError
            );


            // Emergency continues even if media permission fails

            setIndicator(
                "camera",
                "error",
                "Unavailable"
            );

            setIndicator(
                "audio",
                "error",
                "Unavailable"
            );

            if (sosStatus) {

                sosStatus.textContent =
                    "Emergency active — camera/microphone unavailable";
            }
        }


        // ----------------------------------------------------
        // LOCATION
        // ----------------------------------------------------

        startLocationTracking();


        // ----------------------------------------------------
        // INFORM BACKEND
        // ----------------------------------------------------

        if (socket.connected) {

            socket.emit("sos-start");

            console.log(
                "SOS START SENT TO SERVER"
            );

        } else {

            console.warn(
                "SOCKET NOT CONNECTED — SOS WILL RETRY THROUGH SOCKET"
            );
        }


        if (sosStatus) {

            sosStatus.textContent =
                "Emergency request sent...";
        }

    } catch (error) {

        console.error(
            "SOS START ERROR:",
            error
        );

        sosActive = false;
        emergencyLocked = false;

        await releaseWakeLock();

        if (sosStatus) {

            sosStatus.textContent =
                "Unable to start emergency";
        }

        if (sosButton) {

            sosButton.disabled = false;

            sosButton.innerHTML = `
                <span>SOS</span>
                <small>PRESS FOR HELP</small>
            `;
        }
    }
}


// ============================================================
// RESPONDER ASSIGNED
// ============================================================

socket.on(
    "responder-assigned",
    async () => {

        console.log(
            "RESPONDER ASSIGNED"
        );


        if (sosStatus) {

            sosStatus.textContent =
                "Responder connected";
        }


        setIndicator(
            "responder",
            "active",
            "CONNECTED"
        );


        try {

            if (!localStream) {

                console.warn(
                    "LOCAL MEDIA STREAM DOES NOT EXIST"
                );

                setIndicator(
                    "responder",
                    "waiting",
                    "Responder connected"
                );

                return;
            }


            await createPeerConnection();


            // ------------------------------------------------
            // ADD MEDIA TRACKS
            // ------------------------------------------------

            localStream
                .getTracks()
                .forEach(
                    track => {

                        console.log(
                            "ADDING USER TRACK:",
                            track.kind
                        );

                        peerConnection.addTrack(
                            track,
                            localStream
                        );
                    }
                );


            console.log(
                "USER CAMERA + AUDIO TRACKS ADDED"
            );


            // ------------------------------------------------
            // CREATE OFFER
            // ------------------------------------------------

            const offer =
                await peerConnection.createOffer();


            await peerConnection.setLocalDescription(
                offer
            );


            socket.emit(
                "webrtc-offer",
                {
                    offer
                }
            );


            console.log(
                "WEBRTC OFFER SENT"
            );

        } catch (error) {

            console.error(
                "WEBRTC OFFER ERROR:",
                error
            );

            setIndicator(
                "responder",
                "error",
                "Connection error"
            );
        }
    }
);


// ============================================================
// NO RESPONDER
// ============================================================

socket.on(
    "no-responder",
    () => {

        console.log(
            "NO RESPONDER AVAILABLE"
        );

        setIndicator(
            "responder",
            "waiting",
            "Waiting for responder..."
        );

        if (sosStatus) {

            sosStatus.textContent =
                "Emergency active — waiting for responder";
        }
    }
);


// ============================================================
// RESPONDER STATUS
// ============================================================

socket.on(
    "responder-status",
    ({ status }) => {

        console.log(
            "RESPONDER STATUS:",
            status
        );


        if (status === "disconnected") {

            setIndicator(
                "responder",
                "error",
                "Connection lost"
            );

            if (sosStatus) {

                sosStatus.textContent =
                    "Emergency still active";
            }

            return;
        }


        if (status === "resolved") {

            finishEmergency();
        }
    }
);


// ============================================================
// RESPONDER UNAVAILABLE
// ============================================================

socket.on(
    "responder-unavailable",
    () => {

        console.log(
            "RESPONDER UNAVAILABLE"
        );

        setIndicator(
            "responder",
            "waiting",
            "Responder unavailable"
        );

        if (sosStatus) {

            sosStatus.textContent =
                "Emergency remains active";
        }
    }
);


// ============================================================
// WEBRTC ANSWER
// ============================================================

socket.on(
    "webrtc-answer",
    async ({ answer }) => {

        console.log(
            "WEBRTC ANSWER RECEIVED"
        );


        if (!peerConnection) {

            console.warn(
                "NO PEER CONNECTION AVAILABLE"
            );

            return;
        }


        try {

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(answer)
            );


            console.log(
                "RESPONDER ANSWER SET"
            );


            // ------------------------------------------------
            // ADD QUEUED ICE CANDIDATES
            // ------------------------------------------------

            if (
                pendingIceCandidates.length > 0
            ) {

                console.log(
                    "ADDING QUEUED ICE CANDIDATES:",
                    pendingIceCandidates.length
                );

                for (
                    const candidate
                    of pendingIceCandidates
                ) {

                    try {

                        await peerConnection.addIceCandidate(
                            candidate
                        );

                    } catch (error) {

                        console.error(
                            "QUEUED ICE ERROR:",
                            error
                        );
                    }
                }

                pendingIceCandidates = [];
            }


            setIndicator(
                "responder",
                "active",
                "LIVE • CONNECTED"
            );


            if (sosStatus) {

                sosStatus.textContent =
                    "Emergency monitoring active";
            }

        } catch (error) {

            console.error(
                "ANSWER ERROR:",
                error
            );

            setIndicator(
                "responder",
                "error",
                "Connection error"
            );
        }
    }
);


// ============================================================
// WEBRTC ICE CANDIDATE
// ============================================================

socket.on(
    "webrtc-ice-candidate",
    async ({ candidate }) => {

        if (!candidate) {
            return;
        }


        if (!peerConnection) {

            console.warn(
                "ICE RECEIVED WITHOUT PEER CONNECTION"
            );

            return;
        }


        const rtcCandidate =
            new RTCIceCandidate(candidate);


        // ----------------------------------------------------
        // REMOTE DESCRIPTION NOT READY
        // ----------------------------------------------------

        if (
            !peerConnection.remoteDescription
        ) {

            console.log(
                "QUEUEING ICE CANDIDATE"
            );

            pendingIceCandidates.push(
                rtcCandidate
            );

            return;
        }


        try {

            await peerConnection.addIceCandidate(
                rtcCandidate
            );

            console.log(
                "USER ICE ADDED"
            );

        } catch (error) {

            console.error(
                "USER ICE ERROR:",
                error
            );
        }
    }
);


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

async function createPeerConnection() {

    // --------------------------------------------------------
    // CLOSE OLD CONNECTION
    // --------------------------------------------------------

    if (peerConnection) {

        try {
            peerConnection.close();
        } catch (error) {

            console.warn(
                "OLD PEER CLOSE ERROR:",
                error
            );
        }

        peerConnection = null;
    }


    pendingIceCandidates = [];


    // --------------------------------------------------------
    // CREATE CONNECTION
    // --------------------------------------------------------

    peerConnection =
        new RTCPeerConnection(
            RTC_CONFIG
        );


    console.log(
        "USER PEER CONNECTION CREATED"
    );


    // --------------------------------------------------------
    // ICE
    // --------------------------------------------------------

    peerConnection.onicecandidate =
        event => {

            if (!event.candidate) {
                return;
            }


            socket.emit(
                "webrtc-ice-candidate",
                {
                    candidate: event.candidate
                }
            );


            console.log(
                "USER ICE SENT"
            );
        };


    // --------------------------------------------------------
    // ICE CONNECTION STATE
    // --------------------------------------------------------

    peerConnection.oniceconnectionstatechange =
        () => {

            if (!peerConnection) {
                return;
            }

            console.log(
                "USER ICE STATE:",
                peerConnection.iceConnectionState
            );
        };


    // --------------------------------------------------------
    // CONNECTION STATE
    // --------------------------------------------------------

    peerConnection.onconnectionstatechange =
        () => {

            if (!peerConnection) {
                return;
            }


            const state =
                peerConnection.connectionState;


            console.log(
                "USER WEBRTC STATE:",
                state
            );


            if (state === "new") {

                setIndicator(
                    "responder",
                    "waiting",
                    "Preparing connection..."
                );
            }


            if (state === "connecting") {

                setIndicator(
                    "responder",
                    "waiting",
                    "Connecting..."
                );
            }


            if (state === "connected") {

                setIndicator(
                    "responder",
                    "active",
                    "LIVE • CONNECTED"
                );


                if (sosStatus) {

                    sosStatus.textContent =
                        "Emergency monitoring active";
                }


                console.log(
                    "USER WEBRTC CONNECTED"
                );
            }


            if (state === "disconnected") {

                setIndicator(
                    "responder",
                    "error",
                    "Connection interrupted"
                );
            }


            if (state === "failed") {

                setIndicator(
                    "responder",
                    "error",
                    "Connection failed"
                );


                console.error(
                    "USER WEBRTC FAILED"
                );
            }


            if (state === "closed") {

                setIndicator(
                    "responder",
                    "error",
                    "Connection closed"
                );
            }
        };
}


// ============================================================
// LIVE LOCATION
// ============================================================

function startLocationTracking() {

    if (!navigator.geolocation) {

        setIndicator(
            "location",
            "error",
            "Not supported"
        );

        return;
    }


    // --------------------------------------------------------
    // CLEAR PREVIOUS WATCH
    // --------------------------------------------------------

    if (locationWatchId !== null) {

        navigator.geolocation.clearWatch(
            locationWatchId
        );

        locationWatchId = null;
    }


    setIndicator(
        "location",
        "waiting",
        "Acquiring location..."
    );


    locationWatchId =
        navigator.geolocation.watchPosition(

            position => {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;


                console.log(
                    "LIVE LOCATION:",
                    latitude,
                    longitude
                );


                setIndicator(
                    "location",
                    "active",
                    `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                );


                socket.emit(
                    "location-update",
                    {
                        latitude,
                        longitude
                    }
                );
            },


            error => {

                console.error(
                    "LOCATION ERROR:",
                    error
                );


                let message =
                    "Location unavailable";


                if (
                    error.code ===
                    error.PERMISSION_DENIED
                ) {

                    message =
                        "Permission required";
                }


                if (
                    error.code ===
                    error.POSITION_UNAVAILABLE
                ) {

                    message =
                        "Location unavailable";
                }


                if (
                    error.code ===
                    error.TIMEOUT
                ) {

                    message =
                        "Location timeout";
                }


                setIndicator(
                    "location",
                    "error",
                    message
                );
            },


            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 10000
            }
        );
}


// ============================================================
// USER CANCEL
// ============================================================

if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        () => {

            if (!sosActive) {
                return;
            }


            console.log(
                "USER ATTEMPTED TO CANCEL"
            );


            cancelButton.disabled = true;

            cancelButton.textContent =
                "Emergency Still Active";


            if (sosStatus) {

                sosStatus.textContent =
                    "Emergency remains active";
            }


            setIndicator(
                "responder",
                "active",
                "Responder monitoring"
            );


            console.log(
                "USER CANNOT END ACTIVE EMERGENCY"
            );
        }
    );
}


// ============================================================
// SOS STATUS
// ============================================================

socket.on(
    "sos-status",
    ({ status }) => {

        console.log(
            "SOS STATUS:",
            status
        );


        if (status === "RESOLVED") {

            finishEmergency();

            return;
        }


        if (
            status ===
            "USER_DISCONNECTED"
        ) {

            if (sosStatus) {

                sosStatus.textContent =
                    "User connection disconnected";
            }


            setIndicator(
                "responder",
                "error",
                "Session interrupted"
            );
        }
    }
);


// ============================================================
// FINISH EMERGENCY
// ============================================================

async function finishEmergency() {

    console.log(
        "EMERGENCY FINISHED BY RESPONDER"
    );


    sosActive = false;
    emergencyLocked = false;


    // --------------------------------------------------------
    // WAKE LOCK
    // --------------------------------------------------------

    await releaseWakeLock();


    // --------------------------------------------------------
    // LOCATION
    // --------------------------------------------------------

    if (locationWatchId !== null) {

        navigator.geolocation.clearWatch(
            locationWatchId
        );

        locationWatchId = null;
    }


    // --------------------------------------------------------
    // CAMERA + MICROPHONE
    // --------------------------------------------------------

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {

                    track.stop();
                }
            );

        localStream = null;
    }


    // --------------------------------------------------------
    // WEBRTC
    // --------------------------------------------------------

    if (peerConnection) {

        try {
            peerConnection.close();
        } catch (error) {

            console.warn(
                "PEER CLOSE ERROR:",
                error
            );
        }

        peerConnection = null;
    }


    pendingIceCandidates = [];


    // --------------------------------------------------------
    // UI
    // --------------------------------------------------------

    if (sosStatus) {

        sosStatus.textContent =
            "Emergency resolved by responder";
    }


    setIndicator(
        "responder",
        "waiting",
        "Emergency completed"
    );


    setIndicator(
        "camera",
        "waiting",
        "Stopped"
    );


    setIndicator(
        "audio",
        "waiting",
        "Stopped"
    );


    setIndicator(
        "location",
        "waiting",
        "Emergency ended"
    );


    if (sosButton) {

        sosButton.disabled = true;

        sosButton.innerHTML = `
            <span>RESOLVED</span>
            <small>EMERGENCY COMPLETED</small>
        `;
    }


    if (cancelButton) {

        cancelButton.disabled = true;

        cancelButton.textContent =
            "Emergency Resolved";
    }
}


// ============================================================
// PAGE EXIT PROTECTION
// ============================================================

window.addEventListener(
    "beforeunload",
    () => {

        if (peerConnection) {

            try {
                peerConnection.close();
            } catch (error) {

                console.warn(
                    "PEER CLOSE ERROR:",
                    error
                );
            }
        }
    }
);


// ============================================================
// APP LOADED
// ============================================================

console.log(
    "SECURE SOS GUARDIAN USER APP LOADED"
);

console.log(
    "SCREEN WAKE LOCK SYSTEM READY"
);