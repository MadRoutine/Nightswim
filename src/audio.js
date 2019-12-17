import {logError, updateDebugStats} from "./main.js";
import {LocationList} from "./classes.js";

/*
TRACKS refer to audio files that play in the background
and that are tied to a location.

SOUNDS refer to sound effects that can be triggered.

Tracks and sounds have the following parameters:
sound.filename
sound.howl (is a Howl object)
*/

let soundMuted = false;
let playbackQueue = [];
let no_sound = {
    filename: "no_sound",
    howl: null
};
let currentTrack = no_sound;
let allTracks = [no_sound];
let allSounds = [];
let playback = "paused";
let prevAction = "none";
let lockChange = false;
let fadeTime = 1000;

const changePlayback = function () {
    // This function performs the actual changing of tracks.
    // It takes the last request from playbackQueue and performs it.
    // ANY FURTHER CHANGES TO AUDIO ARE NOW LOCKED UNTIL THIS
    // HAS FINISHED. Once finished, any other requested changes in the queue
    // will be discarded except the very last one.
    lockChange = true;

    let lastIndex = playbackQueue.length - 1;
    let type = playbackQueue[lastIndex].type;
    let nextTrack = playbackQueue[lastIndex].nextTrack;
    let thisFadeTime = fadeTime;

    console.log("Changing playback, playback is currently: " + playback);
    
    if (
        playback === "paused" &&
        prevAction !== "fadein" && (
        (type === "fadein") ||
        (type === "playTrack" && currentTrack.filename === "no_sound")
        )
    ) {
        // Fade in
        playback = "fading";
        prevAction = "fadein";
        nextTrack.howl.volume(0);
        nextTrack.howl.play();
        nextTrack.howl.fade(0, 1, fadeTime);

        $("#soundInfo").text("playing " + nextTrack.filename);

        setTimeout(function () {
            playback = "playing";
        }, fadeTime);

    } else if (
        playback === "playing" &&
        prevAction !== "fadeout" &&
        type === "fadeout"
    ) {
        // Fade out
        /* thisTrack prevents weird behaviour
        in the timeout, because currentTrack
        can be something completely different
        once the timeout has passed */
        let thisTrack = currentTrack;
        playback = "fading";
        prevAction = "fadeout";

        $("#soundInfo").text("fading out");

        if (thisTrack.filename !== "no_sound") {
            thisTrack.howl.fade(1, 0, fadeTime);

            setTimeout(function () {
                thisTrack.howl.pause();
                playback = "paused";

                $("#soundInfo").text("playback paused");
            }, fadeTime);
        }

    } else if (
            playback === "playing" &&
            type === "playTrack" &&
            nextTrack !== currentTrack
        ) {
        // Crossfade, unless it's the same file
        playback = "fading";
        prevAction = "crossfade";
        $("#soundInfo").text("crossfading");

        if (!soundMuted) {
            nextTrack.howl.play();
        }

        currentTrack.howl.fade(1, 0, fadeTime);
        nextTrack.howl.fade(0, 1, fadeTime);

        setTimeout(function () {
            currentTrack.howl.pause();
            playback = "playing";
            $("#soundInfo").text("playing " + nextTrack.filename);
        }, fadeTime);

    } else if (type === "update") {
        // Only update (happens when sound is muted)
        thisFadeTime = 0;
    }

    // Wait for fades to end
    setTimeout(function () {
        // Job done!
        currentTrack = nextTrack;
        lockChange = false;

        let amnt = playbackQueue.length;
        let amntToRemove = 1;

        /* If there is only 1 item in the queue, remove it, because
        we just ran that job. When there are more than 1, then remove
        all of them, except last one. Then trigger this function again. */
        if (amnt > 1) {
            amntToRemove = amnt - 1;
        }

        playbackQueue.splice(0, amntToRemove);

        if (playbackQueue.length > 0) {
            changePlayback();
        }

    }, thisFadeTime);
};

const requestPlaybackChange = function (request) {
    /*
    The request should look like this:
        {
            type:
            nextTrack:
        }
    */

    console.log("Playback change requested: " + request.type);

    // Add job to playbackQueue
    playbackQueue.push(request);

    // Only run changePlayback() when it's not locked!
    if (!lockChange) {
        changePlayback();
    }
};

const changeTrack = function (newSnd) {
    /*
    This function adds requests for audio
    track changes to the playbackQueue.

    newSnd contains the filename from the
    soundfile as set in locations.js */

    if (newSnd !== currentTrack.filename) {

        if (newSnd !== "no_sound") {
            // First find the track in allTracks
            let found = false;
            let trackNr;
            let i = 0;

            while (i < allTracks.length && !found) {
                if (allTracks[i].filename === newSnd) {
                    found = true;
                    trackNr = i;
                }
                i += 1;
            }

            if (found && !soundMuted) {
                let track = allTracks[trackNr];

                if (track.howl.state() === "unloaded") {
                    track.howl.load();
                    track.howl.once("load", function () {
                        requestPlaybackChange({
                            type: "playTrack",
                            nextTrack: track
                        });
                    });
                } else if (track.howl.state() === "loading") {
                    track.howl.once("load", function () {
                        requestPlaybackChange({
                            type: "playTrack",
                            nextTrack: track
                        });
                    });
                } else {
                    requestPlaybackChange({
                        type: "playTrack",
                        nextTrack: track
                    });
                }
            } else if (found && soundMuted) {
                // Only update currentTrack
                requestPlaybackChange({
                    type: "update",
                    nextTrack: no_sound
                });
            }

        } else {
            /* newSnd has a value of "no_sound":
            Just fade out current track, unless sound is muted */
            if (!soundMuted) {
                requestPlaybackChange({
                    type: "fadeout",
                    nextTrack: no_sound
                });
            } else {
                // Only update currentTrack
                requestPlaybackChange({
                    type: "update",
                    nextTrack: no_sound
                });
            }

            updateDebugStats();
        }
    }
};

const initAudio = function (preloadAudio) {
    /* This function takes all soundfiles from the locations, creates
    Howler objects for every sound, preloads the ones from preLoadAudio,
    and then puts the audio objects in the allTracks array */
    LocationList.forEach(function (loc) {

        let toPreload = false;
        let track = "";

        if (loc.locSnd !== "no_sound") {
            // Multiple locations might use the same soundfile,
            // so let's check if the given soundfile isn't listed
            // in allTracks already
            let exists = false;
            let i = 0;

            while (i < allTracks.length) {
                track = allTracks[i];

                if (track.filename === loc.locSnd) {
                    exists = true;
                    break;
                }

                i += 1;
            }

            // In case it doesn't: create Howl object and add it to the list
            if (!exists) {
                let url = "story/audio/" + loc.locSnd;

                /* Check if preLoadAudio contains this url, and if so: have it
                preload, unless sound is muted */
                if (!soundMuted) {
                    preloadAudio.forEach(function (preloadFile) {
                        preloadFile = "story/audio/" + preloadFile;
                        if (url === preloadFile) {
                            toPreload = true;
                            console.log ("Preloading " + url);
                        }
                    });
                }

                let sound = new Howl({
                    src: [url],
                    loop: true,
                    volume: 0,
                    preload: toPreload
                });

                let nextTrack = {
                    filename: loc.locSnd,
                    howl: sound
                };
                allTracks.push(nextTrack);
            }
        }
    });
};

const muteSound = function () {
    // This works as a switch
    if (soundMuted) {
        // Unmute
        soundMuted = false;
        console.log("Sound unmuted, currentTrack is " + currentTrack.filename);

        if (typeof(Storage) !== "undefined") {
            // Save sound setting in local storage
            localStorage.setItem("muteSound", false);
        }

        if (currentTrack.filename !== "no_sound") {
            if (currentTrack.howl.state() === "loaded") {
                requestPlaybackChange({
                    type: "fadein",
                    nextTrack: currentTrack
                });
            } else {
                currentTrack.howl.load();
                currentTrack.howl.once("load", function () {
                    requestPlaybackChange({
                        type: "fadein",
                        nextTrack: currentTrack
                    });
                });
            }

        }

        $("#soundBtn").removeClass("sound_off");
        $("#soundBtn").addClass("sound_on");

    } else {
        // Mute
        soundMuted = true;
        console.log("Sound muted, currentTrack is " + currentTrack.filename);

        if (typeof(Storage) !== "undefined") {
            // Save sound setting in local storage
            localStorage.setItem("muteSound", true);
        }

        if (currentTrack.filename !== "no_sound") {
            requestPlaybackChange({
                type: "fadeout",
                nextTrack: currentTrack
            });
        }

        $("#soundBtn").removeClass("sound_on");
        $("#soundBtn").addClass("sound_off");
    }
};

const setAudioFadeTime = function (newFadeTime) {
    if (typeof newFadeTime === "number" && newFadeTime >= 0) {
        fadeTime = newFadeTime;
    }
};

const setCurrentTrack = function (track) {
    // This function will run at the beginning
    currentTrack = track;

    if (currentTrack.filename !== "no_sound" && !soundMuted) {
        playback = "playing";

        $("#soundInfo").text("playing " + track.filename);
    } else {
        playback = "paused";

        $("#soundInfo").text("playback paused");
    }
};

const getAudioTrack = function (filename) {
    let found = false;
    let trackNr;
    let i = 0;

    while (i < allTracks.length && !found) {
        if (allTracks[i].filename === filename) {
            found = true;
            trackNr = i;
        }
        i += 1;
    }

    if (found) {
        let track = allTracks[trackNr];
        return track;
    } else {
        return null;
    }
};

const createSoundObj = function (url, toPreload) {

    if (soundMuted) {
        // Override toPreload parameter when sound is muted
        toPreload = false;
    }

    return new Howl({
        src: [url],
        loop: false,
        volume: 1,
        preload: toPreload
    });

};

const loadSound = function (url) {
    // 1 Check if the sound already exists in allSounds
    let found = false;
    let sound = "";
    let soundIndex;
    let j = 0;

    while (j < allSounds.length) {
        sound = allSounds[j];

        if (sound.filename === url) {
            // It exists, so just return its index number
            found = true;
            soundIndex = j;
            break;
        }

        j += 1;
    }

    // 2 If not, then create a new sound object
    if (!found) {
        let extPattern = /(?:\.([^.]+))?$/;
        let ext = extPattern.exec(url)[1];
        if (
            // Need better validation of actual MIME-types, not just extension
            ext !== undefined && (ext === "mp3" || ext === "wav" ||
            ext === "ogg" || ext === "aac" || ext === "flac")
        ) {
            let newSoundObj = {};
            newSoundObj.filename = url;
            newSoundObj.howl = createSoundObj(url, true);

            if (newSoundObj.howl instanceof Howl) {
                allSounds.push(newSoundObj);

                /* If no sound was found then j will have the same
                value as allSounds.length, which will correspond to the index
                our newly created sound will get */
                soundIndex = j;
            } else {
                // Something went wrong
                logError("could not create new Howl sound object");
                soundIndex = -1;
            }
        } else {
            logError("soundfile format not supported");
            soundIndex = -1;
        }
    }

    // 3 Return index nr
    return soundIndex;
};

const playSound = function (i) {
    if (!soundMuted && allSounds[i] !== undefined) {
        allSounds[i].howl.play();
    }
};

export default "loaded";
export {
    changeTrack,
    initAudio,
    muteSound,
    setAudioFadeTime,
    setCurrentTrack,
    soundMuted,
    getAudioTrack,
    createSoundObj,
    loadSound,
    playSound,
    playback
};