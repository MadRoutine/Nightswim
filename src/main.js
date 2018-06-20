import audioLoaded from "./audio.js";
import {
    changeTrack,
    initAudio,
    muteSound,
    setAudioFadeTime,
    setCurrentTrack,
    soundMuted,
    getAudioTrack
} from "./audio.js";
import {startCutscene} from "./cutscene.js";
import {
    changeBg,
    fadeIn,
    fadeOut,
    fadeTime,
    replaceById,
    setBgSize,
    setFadeTime,
    setFeedbackTime,
    showFeedback,
    compositFeedback
} from "./display.js";
import {
    addToButtonQueue,
    createButtons,
    hideMenu,
    isMenuActive,
    menuTracker,
    openInventory
} from "./menu.js";
import {parse, parseLocation} from "./parse.js";
import {
    disableChoice,
    recordSceneChange,
    startScene
} from "./scene.js";
import {
    getObj,
    Obj,
    ObjList,
    Npc,
    NpcList,
    Location,
    LocationList,
    resetObjects
} from "./classes.js";

const VERSION = "0.9.1";
let settings = {};
let ObjListLoaded = false;
let NpcListLoaded = false;
let LocationListLoaded = false;
let initLoaded = false;
let init;
let waitUntilLoaded;
let firstAudioTrack;
// Inventory Map: key=objID, value=show in inventory (true/false)
let Inventory = new Map();

let player = {
    name: "player",
    location: "none",
    locationPrev: "none",
    locationNext: "none",
    inObject: false,
    inScene: false,
    state: "normal",
    moveToMenu: function (objID) {
        player.locationPrev = player.location;
        player.location = objID;
        player.inObject = true;
    },
    leaveMenu: function (newLocation) {
        player.locationPrev = player.location;
        player.location = newLocation;
        player.inObject = false;
    },
    setLocation: function (newLocation) {
        if (player.location !== "locScene" && !player.inObject) {
            player.locationNext = player.location;
        }
        player.locationPrev = player.location;
        player.location = newLocation;
    },
    setInObject: function (value) {
        if (value) {
            player.inObject = true;
        } else {
            player.inObject = false;
        }
    }
};

const updateDebugStats = function () {
    if (soundMuted) {
        $("#soundInfo").html("muted");
    }
    $("#playerlocation").html(player.location);
    $("#playerprevloc").html(player.locationPrev);
    $("#playernextloc").html(player.locationNext);
    $("#inScene").html(player.inScene);
    $("#inObject").html(player.inObject);
    $("#menu_active").html(isMenuActive());
    $("#menu_tracker").html("");
    menuTracker.forEach(function (item) {
        $("#menu_tracker").append("<li>&gt; " + item + "</li>");
    });

};

const logError = function (msg) {
    console.log("ERROR: " + msg);
    $("#err").text("Program error - see console for details");
};

const playCutscene = function (url) {
    $.getJSON(url, function (eventArray) {
        startCutscene(eventArray);
    }).fail(function () {
        logError("main.js/playCutscene: scenefile not loaded: either the file doesn't exist, or there is a syntax-error in the file");
    });
};

const loadScene = function (url) {
    $.getJSON(url, function (choiceList) {
        startScene(choiceList);
    }).fail(function () {
        logError("main.js/loadScene: scenefile not loaded: either the file doesn't exist, or there is a syntax-error in the file");
    });
};

const enterLocation = function (newLoc) {

    /* Entering a new location. Prioritization:
        1. When a cutscene is present: play it.
        2. When a scene is present: start it.
        3. If neither is the case: show location content */

    updateDebugStats();
    let newLocRef = LocationList.get(newLoc);

    /* Check if the new location isn't locked, cause if it is,
    we ain't gonna do it. */
    if (newLocRef.accessMsg !== "unlocked") {
        showFeedback(newLocRef.accessMsg);
    } else {

        // We will have to leave 'object' mode when entering a new location
        player.inObject = false;

        if (isMenuActive()) {
            hideMenu();
        }

        // Change background image
        changeBg(newLocRef);

        // Change audio track
        changeTrack(newLocRef.locSnd);

        if (newLocRef.name !== "In scene") {
            player.locationNext = newLoc;
        }

        player.locationPrev = player.location;
        player.location = newLoc;
        player.inScene = false;

        // 1 - Check if a cutscene needs to be played and if so: play it.
       let sceneName;
       let sceneTriggered = false;
       let sceneList = Object.keys(newLocRef.cutscenes);
       let j = 0;

       while (j < sceneList.length && !sceneTriggered) {
           sceneName = sceneList[j];

           if (newLocRef.cutscenes[sceneName]) {
               // Deactivate this cutscene
               newLocRef.cutscenes[sceneName] = false;

               // Play scene
               playCutscene("story/scenes/" + sceneName + ".json");

               sceneTriggered = true;
           }
           j += 1;
       }

        /* 2 - Check every scene in the location object to see if any scene
        is set to 'true'. As soon as one is found: start it. */
        sceneList = Object.keys(newLocRef.scenes);
        j = 0;

        while (j < sceneList.length && !sceneTriggered) {
            sceneName = sceneList[j];

            if (newLocRef.scenes[sceneName]) {
                // Deactivate this scene
                newLocRef.scenes[sceneName] = false;

                // Load scene
                loadScene("story/scenes/" + sceneName + ".json");

                sceneTriggered = true;
            }
            j += 1;
        }

        // 3 - Display Location content
        if (!sceneTriggered) {

            /*
            parseLocation returns an array with this
            layout:
                [
                    {
                        section: "sectionHTML",
                        delay: delayTime (optional)
                    }
                ]
            */
            let locContent = parseLocation(newLocRef.content);

            player.inScene = false;

            // Fade out everything
            fadeOut("text");
            fadeOut("choices");

            /* Replace content & choices.
            The timeout is because we have to wait for the
            fade out to finish */
            setTimeout(function () {

                let compositHTML = "";
                let delayArray = [];
                let delayNr = 0;
                let delayID;

                /* Display all sections, wrap delays in Divs, and
                afterwards select these Divs and set opacity to 1; */
                locContent.forEach(function (section) {

                    if (section.delay !== undefined && section.delay > 0) {

                        delayID = "delay_" + delayNr;

                        section.sectionHTML = "<div id=\"" + delayID +
                        "\" class=\"waitForFade\">" + section.sectionHTML +
                        "</div>";

                        delayArray.push(section.delay);

                        delayID += 1;

                    }

                    compositHTML += section.sectionHTML;
                });

                replaceById("text", compositHTML, 0, newLoc);

                createButtons();

                fadeIn("text");
                fadeIn("choices");

                // Go through delayArray to fade in sections
                delayNr = 0;
                delayArray.forEach (function (delayTime) {
                    /* Important: the delayNr that's included in the delayID matches the index of the times in the delayArray.
                    In other words: delayArray[0] contains the delay time
                    (in milliseconds) that corresponds with
                    <div id="delay_0">
                    */
                    let i = delayNr;
                    let locBeforeTimeout = newLoc;

                    setTimeout(function () {
                        /* We need to check if the location didn't change
                        during the timeout */
                        if (player.location === locBeforeTimeout) {
                            document.getElementById(
                                "delay_" + i
                            ).style.opacity = 1;
                        }
                    }, delayTime);
                    delayNr += 1;
                });

            }, fadeTime);
        }
    }
    updateDebugStats();
};

const refreshLocation = function () {

    // We'll use player.locationNext
    let loc = player.locationNext;
    let locRef = LocationList.get(loc);
    let locContent = parseLocation(locRef.content);
    let compositHTML = "";

    locContent.forEach(function (section) {
        compositHTML += section.sectionHTML;
    });

    replaceById("text", compositHTML, 0);
    createButtons();

    // We will have to leave 'object' mode when refreshing the location
    player.inObject = false;

};

const initStory = function () {
    /*
    This function is only used for preloading JSON data and creating
    the game objects
    */

    // This is only necessary when testing the game on local storage
    $.ajaxSetup({beforeSend: function (xhr) {
        if (xhr.overrideMimeType) {
            xhr.overrideMimeType("application/json");
        }
    }});

    // Instantiate all Obj's
    $.getJSON("story/obj_list.json", function (object) {
        $.each(object, function (key, value) {
            new Obj(
                value.name,
                value.description,
                value.location,
                value.state,
                value.interactions,
                value.receive,
                value.content,
                value.singleUse
            );
        });
        ObjListLoaded = true;
        console.log("Obj's loaded");
    }).fail(function () {
        logError("Obj's not loaded. This is probably caused by a syntax-error in obj_list.json");
    });

    // Instantiate all Npc's
    $.getJSON("story/npc_list.json", function (npc) {
        $.each(npc, function (id, value) {
            new Npc(
                value.name,
                value.description,
                value.location,
                value.state,
                value.interactions,
                value.receive,
                value.comfortLevel,
                value.sceneQueue
            );
        });
        NpcListLoaded = true;
        console.log("Npc's loaded");
    }).fail(function () {
        logError("Npc's not loaded. This is probably caused by a syntax-error in npc_list.json");
    });

    // Instantiate all locations
    $.getJSON("story/locations.json", function (location) {

        // Wait for Obj's and Npc's to be done loading
        let waitUntilStoryDataLoaded = setInterval(function () {
            if (ObjListLoaded && NpcListLoaded && audioLoaded === "loaded") {

                clearInterval(waitUntilStoryDataLoaded);

                $.each(location, function (id, loc) {
                    new Location(
                        loc.locID,
                        loc.name,
                        loc.accessMsg,
                        loc.locImg,
                        loc.locSnd,
                        loc.cutscenes,
                        loc.scenes,
                        loc.content,
                        loc.styling
                    );
                });
                LocationListLoaded = true;
                console.log("Locations loaded");

            } else {
                console.log("Not yet ready. ObjListLoaded = " + ObjListLoaded + ", NpcListLoaded = " + NpcListLoaded);
            }
        }, 100);
    }).fail(function () {
        logError("Locations not loaded. This is probably caused by a syntax-error in locations.json");
    });

    // Taking settings from init.js
    $.getJSON("story/init.json", function (initObj) {
        init = initObj;
        initLoaded = true;
    }).fail(function () {
        logError("Init settings not loaded. This is probably caused by a syntax-error in init.json");
    });

};

const startStory = function () {

    // Make scene location object
    let thisLoc = new Location(
        "locScene",
        "In scene",
        "locked",
        "no_bg",
        "no_sound",
        {},
        {}
    );

    let startLoc = init.startLocation;
    player.locationPrev = startLoc;
    player.locationNext = startLoc;

    // Add key listener for Escape key & Spacebar
    document.onkeydown = function (evt) {
        evt = evt || window.event;

        let isEscape = false;
        let isSpacebar = false;

        if (evt.key !== undefined) {
            isEscape = (evt.key === "Escape" || evt.key === "Esc");
            isSpacebar = (evt.key === " ");
        } else {
            isEscape = (evt.keyCode === 27);
            isSpacebar = (evt.keyCode === 32);
        }

        if (isEscape) {
            if (isMenuActive()) {
                hideMenu();
            }
        }

        if (isSpacebar) {
            if (init.enableInventory) {
                if (player.location === player.inventory.name) {
                    hideMenu();
                } else {
                    openInventory();
                }
            }
        }
    };

    /* Make inventory object, even when enableInventory is false,
    because some mechanics depend on this object. So when
    enableInventory is false then the inventory will only
    be hidden from the player, but it will still be there. */
    player.inventory = new Obj(
        "Inventory",
        "Stuff you're carrying around",
        "player",
        "default",
        "<p>Choose an object:</p>",
        []
    );

    if (init.enableInventory) {
        // Clickable button
        $("#inventory").click(openInventory);
    } else {
        document.getElementById("inventory").style.display = "none";
    }

    if (init.debugStats) {
        document.getElementById("debugstats").style.display = "block";
    }

    // Add clickable functions for 'Mute sound'
    $("#muteButton").click(muteSound);

    document.getElementById("storyTitle").style.display = "none";
    document.querySelector("header").style.opacity = 1;

    settings = init.storySettings;

    setBgSize(init.bgSize);
    setFadeTime(init.fadeTime);
    setFeedbackTime(init.feedbackTime);
    let slowerFadeTime = fadeTime * 2;

    setTimeout(function () {
        /*
        enterLocation does a fadeOut & fadeIn of #text and #choices,
        but since we want a nicer, slower fade out and in of the
        title screen we have to do that on the entire #container.
        The fadeOut already happened after the click event.
        */
        fadeIn("container", slowerFadeTime);
    }, fadeTime);

    enterLocation(startLoc);
};

const directAction = function (obj) {
    /*
    Only perform when interaction isn't none!
    When interaction is TALK, only when there are scenes in the queue AND if
    we're not in a scene already!
    When multiple interactions are given, the first one will be
    executed.
    */

    let objRef = ObjList.get(obj);

    if (objRef.interactions.length > 0) {

        let selected = objRef.interactions[0];
        if (!(
            selected.type === "talk" &&
            (
                objRef.sceneQueue === undefined ||
                objRef.sceneQueue.length <= 0 ||
                player.inScene
            )
        )) {
            objRef.interact(0, true);
        }
    }
};

const checkConditions = function (condList, displayFeedback = true) {
    /* This function handles all conditions.
    condList is an array containing condObj's.
    A condObj consists of condObj.type and condObj.value,
    and when necessary condObj.obj and condObj.storySetting
    */

    let checkArray = [];
    let conditionsMet = true;
    let feedback = [];
    let i = 0;
    let success;
    let type;
    let value;
    let loc;
    let obj;
    let objRef;

    if (condList.length > 0) {
        condList.forEach(function (condObject) {

            let found = false;
            let failMsg;

            if (
                condObject.failMsg !== undefined &&
                typeof condObject.failMsg === "string" &&
                condObject.failMsg !== ""
            ) {
                failMsg = condObject.failMsg;
            } else {
                failMsg = "no_msg";
            }

            type = condObject.type;
            value = condObject.value;

            if (condObject.loc !== undefined) {
                loc = LocationList.get(condObject.loc);

                if (loc instanceof Location) {
                    objRef = LocationList.get(condObject.loc);
                }
            }

            if (condObject.npc !== undefined) {
                condObject.obj = condObject.npc;
            }

            if (condObject.obj !== undefined) {
                obj = getObj(condObject.obj);
                objRef = obj.ref;
            }

            switch (type) {
            case "state":
                if (objRef.state === value) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "inInventory":
                if (Inventory.has(objRef.name)) {
                    found = true;
                }

                if (found) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "location":
                if (objRef.loc === value) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "locationAccess":
                if (objRef.accessMsg === value) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "npcComfortLevel":
                if (objRef.comfortLevel >= value) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "storySetting":
                success = false;

                if (
                    condObject.compare === undefined ||
                    (condObject.compare !== "equal" &&
                     condObject.compare !== "larger" &&
                     condObject.compare !== "smaller")
                ) {
                    condObject.compare = "equal";
                }

                if (condObject.compare === "equal") {
                    if (value === settings[condObject.storySetting]) {
                        success = true;
                    }
                } else if (condObject.compare === "larger") {
                    if (value > settings[condObject.storySetting]) {
                        success = true;
                    }
                } else if (condObject.compare === "smaller") {
                    if (value < settings[condObject.storySetting]) {
                        success = true;
                    }
                }

                if (success) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;
            }

        });
    }

    // Check the array to see if any false came up
    if (checkArray.length > 0) {

        checkArray.forEach(function (result) {
            if (!result) {
                // One of the conditions has not been met
                conditionsMet = false;
            }
        });

        if (conditionsMet) {
            return true;
        } else {
            if (displayFeedback) {
                if (feedback.length > 0) {
                    compositFeedback(feedback);
                }
            }
            return false;
        }

    } else {
        /*
        No valid conditions were checked at all.
        This validates as true, because it means
        there are no conditions
        */
        return true;
    }

};

const change = function (changeArray) {
    /* This funcion handles all consequences
    Basic rule: every parameter should either be a string or an integer */

    let success = false;
    let locRef;
    let npcRef;
    let objInfo;
    let objRef;
    let objType;
    let feedback = [];
    let restarted = false;
    let i = 0;
    let j = 0;

    while (changeArray.length < j) {

        let changeObj = changeArray[j];

        switch (changeObj.type) {

        case "addScene":
            // REQUIRED: npc, scene
            npcRef = NpcList.get(changeObj.npc);

            if (
                npcRef instanceof Npc &&
                changeObj.scene !== undefined &&
                typeof changeObj.scene === "string"
            ) {
                // addScene will return true/false
                success = npcRef.addScene(changeObj.scene);
            }
            break;

        case "changeActivation":
            // REQUIRED: obj, index, value
            // Check if object is Obj or Npc
            objInfo = getObj(changeObj.obj);

            if (
                objInfo.type !== "unknown" &&
                changeObj.index !== undefined &&
                typeof changeObj.index === "number" &&
                changeObj.index >= 0 &&
                changeObj.value !== undefined &&
                typeof changeObj.value === "boolean"
            ) {
                success = objInfo.ref.setInteraction(
                    changeObj.index, changeObj.value
                );
            }
            break;

        case "changeLoc":
            // REQUIRED: loc
            locRef = LocationList.get(changeObj.loc);
            if (
                locRef !== undefined &&
                locRef instanceof Location
            ) {
                enterLocation(changeObj.loc);
                /* recordSceneChange prevents the ending of a scene
                from also triggering enterLocation() */
                recordSceneChange();
                success = true;
            }
            break;

        case "changeLocAccess":
            // REQUIRED: loc, accessMsg
            locRef = LocationList.get(changeObj.loc);

            if (locRef !== undefined && locRef instanceof Location) {
                success = locRef.setAccessMsg(changeObj.accessMsg);
            }
            break;

        case "changeLocBg":
            // REQUIRED: loc, file
            locRef = LocationList.get(changeObj.loc);

            if (locRef !== undefined && locRef instanceof Location) {
                success = locRef.setLocImg(changeObj.file);
            }
            break;

        case "changeLocSound":
            // REQUIRED: loc, file
            locRef = LocationList.get(changeObj.loc);

            if (locRef !== undefined && locRef instanceof Location) {
                success = locRef.setLocSnd(changeObj.file);
            }
            break;

        case "changeNpcInteraction":
            // REQUIRED: npc, interaction
            npcRef = NpcList.get(changeObj.npc);

            if (
                npcRef instanceof Npc &&
                changeObj.interaction !== undefined &&
                typeof changeObj.interaction === "string"
            ) {
                npcRef.interaction = changeObj.interaction;
                success = true;
            }
            break;

        case "changeObjDescr":
            // REQUIRED: obj, value
            // Check if object is Obj or Npc
            objInfo = getObj(changeObj.obj);

            if (objInfo.type !== "unknown") {
                success = objInfo.ref.setDescr(changeObj.value);
            }
            break;

        case "changeObjLoc":
            // REQUIRED: obj, value
            // Check if object is Obj or Npc
            objInfo = getObj(changeObj.obj);

            if (objInfo.type !== "unknown") {
                success = objInfo.ref.setLoc(changeObj.value);
            }
            break;

        case "changeObjState":
            // REQUIRED: obj, value
            // Check if object is Obj or Npc
            objInfo = getObj(changeObj.obj);

            if (objInfo.type !== "unknown") {
                success = objInfo.ref.setState(changeObj.value);
            }
            break;

        case "changePlayerState":
            // REQUIRED: state
            if (
                changeObj.state !== undefined &&
                typeof changeObj.state === "string"
            ) {
                player.state = changeObj.state;
                success = true;
            }
            break;

        case "changeSceneState":
            // REQUIRED: loc, scene, activate
            locRef = LocationList.get(changeObj.loc);

            if (
                locRef instanceof Location &&
                changeObj.scene !== undefined &&
                typeof changeObj.scene === "string" &&
                changeObj.activate !== undefined &&
                typeof changeObj.activate === "boolean"
            ) {
                locRef.scenes[changeObj.scene] = changeObj.activate;
                success = true;

            }
            break;

        case "changeStorySetting":
            // REQUIRED: storySetting, value
            if (settings[changeObj.storySetting] !== undefined) {
                settings[changeObj.storySetting] = changeObj.value;
                success = true;
            }
            break;

        case "disableChoice":
            // REQUIRED: choice
            if (
                changeObj.choice !== undefined &&
                typeof changeObj.choice === "string"
            ) {
                success = disableChoice(choice);
            }
            break;

        case "displayTxt":
            // REQUIRED: txt
            if (
                changeObj.txt !== undefined &&
                typeof changeObj.txt === "string"
            ) {
                // fade out everything
                fadeOut("container");

                // replace content & choices
                setTimeout(function () {
                    replaceById("text", changeObj.txt, 0);
                    addToButtonQueue("Continue", "refresh", "refreshLoc");
                    createButtons();
                    fadeIn("container");
                }, fadeTime);

                success = true;
            }
            break;

        case "fadeOut":
            // REQUIRED: id
            if (
                changeObj.id !== undefined &&
                typeof changeObj.id === "string"
            ) {
                fadeOut(changeObj.id);
                success = true;
            }
            break;

            case "increaseNpcComfort":
            // REQUIRED: npc, amount
            npcRef = NpcList.get(changeObj.npc);

            if (
                npcRef instanceof Npc &&
                changeObj.amount !== undefined &&
                typeof changeObj.amount === "number"
            ) {
                npcRef.comfortLevel += changeObj.amount;
                success = true;
            }
            break;

        case "refresh":
            // Nothing required
            refreshLocation();
            success = true;
            break;

        case "removeSection":
            // REQUIRED: locID, section
            locRef = LocationList.get(changeObj.loc);
            if (
                locRef !== undefined &&
                locRef.content[changeObj.section] !== undefined &&
                typeof locRef.content[changeObj.section] === "object"
            ) {
                locRef.content.splice(changeObj.section, 1);
                success = true;
            }
            break;

        case "restart":
            // Nothing required
            restartStory();
            success = true;
            restarted = true;
            break;

        case "triggerCutscene":
            // REQUIRED: cutscene
            if (
                changeObj.cutscene !== undefined &&
                typeof changeObj.cutscene === "string"
            ) {
                loadCutscene("story/scenes/" + changeObj.scene + ".json");
                /*
                A new cutscene will trigger a location change by ending. recordSceneChange prevents the old scene from finishing.
                */
                recordSceneChange();
                success = true;
            }
            break;

        case "triggerScene":
            // REQUIRED: scene
            if (
                changeObj.scene !== undefined &&
                typeof changeObj.scene === "string"
            ) {
                loadScene("story/scenes/" + changeObj.scene + ".json");
                /*
                A new scene will trigger a location change by ending. recordSceneChange prevents the old scene from finishing.
                */
                recordSceneChange();
                success = true;
            }
            break;
        }

        if (
            success &&
            changeObj.feedback !== undefined &&
            typeof changeObj.feedback === "string"
        ) {
            feedback[i] = changeObj.feedback;
            i += 1;
        } else if (!success) {
            logError("consequence failed: " + changeObj.type);
        }

        j += 1;

        /* In case the "restart" consequence was called: cancel all other
        consequences */
        if (restarted) {
            j = changeArray.length;
            break;
        }
    }

    if (feedback.length > 0) {
        compositFeedback(feedback);
    }

};

const autoStart = function () {
    // This function runs at the start when init.devAutoStart is true
    waitUntilLoaded = setInterval(function () {
        if (
            /* LocationList will wait with loading until
            NpcList and ObjList have loaded */
            LocationListLoaded &&
            initLoaded &&
            audioLoaded === "loaded"
        ) {
            clearInterval(waitUntilLoaded);
            let preLoadAudio;

            if (init.muteSound) {
                // Need to do this before initAudio()
                muteSound();
            }

            setAudioFadeTime(init.audioFadeTime);

            // Preload audio from the init.json array
            if (
                Array.isArray(init.preLoadAudio) && init.preLoadAudio.length > 0
            ) {
                preLoadAudio = init.preLoadAudio;
            } else {
                preLoadAudio = [];
            }
            initAudio(init.preloadAudio);

            startStory();
        }
    }, 100);
};

const restartStory = function () {
    // Empty and reset everything
    init = {};
    initLoaded = false;
    ObjListLoaded = false;
    NpcListLoaded = false;
    LocationListLoaded = false;
    resetObjects();

    // Reinitialize
    initStory();
    waitUntilLoaded = setInterval(function () {
        if (initLoaded && audioLoaded === "loaded") {
            clearInterval(waitUntilLoaded);
            // Restart
            autoStart();
        }
    }, 100);
};

$(document).ready(function () {

    console.log("This story is powered by Nightswim " + VERSION);
    initStory();

    waitUntilLoaded = setInterval(function () {
        if (initLoaded && audioLoaded === "loaded") {

            clearInterval(waitUntilLoaded);

            if (init.muteSound) {
                $("#playSound").text("Turn sound on");
            }

            $("#playSound").click(function () {
                if (init.muteSound) {
                    init.muteSound = false;
                    $("#playSound").text("Turn sound off");
                } else {
                    init.muteSound = true;
                    $("#playSound").text("Turn sound on");
                }
            });

            if (init.devAutoStart) {
                autoStart();
            }
        }
    }, 100);

    $("#startButton").one("click", function () {
        /*
        We start by triggering startStory(), but only after the objects
        and npc's and locations have finished loading.

        We need to call a play() command right here, or else Safari
        on iOS will not see this click as a user interaction that is
        permitted to enable audio playback.

        So while all scripts have already loaded before this point
        (through initStory), all the rest happens in startStory,
        except for the audio-related stuff that's necessary right
        now.
        */
        if (!init.devAutoStart) {
            waitUntilLoaded = setInterval(function () {
                if (
                    /* LocationList will wait with loading until
                    NpcList and ObjList have loaded */
                    LocationListLoaded &&
                    initLoaded &&
                    audioLoaded === "loaded"
                ) {
                    clearInterval(waitUntilLoaded);
                    let preLoadAudio;

                    if (init.muteSound) {
                        // Need to do this before initAudio()
                        muteSound();
                    }

                    setAudioFadeTime(init.audioFadeTime);

                    // Preload audio from the init.json array
                    if (
                        Array.isArray(init.preLoadAudio) &&
                        init.preLoadAudio.length > 0
                    ) {
                        preLoadAudio = init.preLoadAudio;
                    } else {
                        preLoadAudio = [];
                    }
                    initAudio(init.preloadAudio);

                    if (!init.muteSound) {
                        // We had to wait for this until initAudio was called
                        let startLocRef = LocationList.get(init.startLocation);
                        if (startLocRef.locSnd !== "no_sound") {
                            /*
                            Retrieve audio object for this location from audio
                            module. We have to start playback here, or else
                            Safari will not count clicking "Lets go" as a
                            user interaction that can start sound playback.
                            */
                            firstAudioTrack = getAudioTrack(startLocRef.locSnd);
                            setCurrentTrack(firstAudioTrack);
                            firstAudioTrack.sound.load();
                            console.log("Loading first audiotrack: " +
                            firstAudioTrack.filename);
                            firstAudioTrack.sound.volume(1);
                            firstAudioTrack.sound.play();
                        }
                    }
                    fadeOut("container", fadeTime);
                    setTimeout(startStory, fadeTime);
                }
            }, 100);
        }
    });
});

export default "Main Story Module";
export {
    player,
    enterLocation,
    refreshLocation,
    loadScene,
    directAction,
    updateDebugStats,
    checkConditions,
    change,
    logError,
    Inventory,
    restartStory
};