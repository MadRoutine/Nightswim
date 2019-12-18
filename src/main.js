// audioModuleLoaded is the default export
import audioModuleLoaded from "./audio.js";
import {
    changeTrack,
    initAudio,
    muteSound,
    setAudioFadeTime,
    setCurrentTrack,
    soundMuted,
    getAudioTrack,
    loadSound,
    playSound
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
    addFeedback,
    compositFeedback,
    toggleFullscreen
} from "./display.js";
import {
    addToButtonQueue,
    createButtons,
    hideMenu,
    invActive,
    menuActive,
    menuTracker,
    openInventory
} from "./menu.js";
import {parseLocation} from "./parse.js";
import {
    disableChoice,
    startScene
} from "./scene.js";
import {
    getObj,
    Obj,
    ObjList,
    Npc,
    NpcList,
    Location,
    LocationList
} from "./classes.js";

const VERSION = "1.2.0-alpha";
let settings = {};
let ObjListLoaded = false;
let NpcListLoaded = false;
let LocationListLoaded = false;
let initLoaded = false;
let init;
let waitUntilLoaded;
let firstAudioTrack;
let locationQueue = [];
let locationChangeInProgress = false;
let storedVersion;
let storedSpace;
let storedMute;
let startButtonLocked = false;
// The action log keeps a list of all changes that occured in the game
// through the change() function as a result of player interactions.
// It's saved into localStorage and retrieved and reapplied whenever
// a user wishes to continue with a previously started story.
let actionLog = [];
// Inventory Map: key=objID, value=show in inventory (true/false)
let Inventory = new Map();
let cutscene = {
    changeObj: {},
    play: function (url) {
        $.getJSON(url, function (eventArray) {
            startCutscene(eventArray);
        }).fail(function () {
            logError("main.js/cutscene.play: scenefile not loaded: either the file doesn't exist, or there is a syntax-error in the file");
        });
    },
    end: function () {
        change([cutscene.changeObj]);
    }
}
let player = {
    // There is a clear distinction between a SPACE and a LOCATION
    // Locations are defined in locations.json, and define the different
    // locations through which the player can navigate. SPACES include
    // Locations, as well as Obj's, Npc's, and "locScene" whenever a player
    // is in a scene. player.currentSpace can be Obj or Npc, as to keep track
    // of what the user is seeing inside a menu.
    // Anyway, player.currentLoc will always display an actual location, and
    // player.currentSpace might not.
    name: "player",
    currentLoc: "none",
    currentSpace: "none",
    prevSpace: "none",
    inObject: false,
    inScene: false,
    state: "normal",
    eventID: 0,
    moveToMenu: function (objID) {
        player.prevSpace = player.currentSpace;
        player.currentSpace = objID;
        player.inObject = true;
    },
    leaveMenu: function (newLoc) {
        player.prevSpace = player.currentSpace;
        player.currentSpace = newLoc;
        player.inObject = false;
    },
    setLocation: function (newLoc) {
        /* Obsolete: delete?
        if (player.currentSpace !== "locScene" && !player.inObject) {
            // This will make sure that currentLoc will always store
            // an actual location, and not an object's name or "locScene"
            player.currentLoc = player.currentSpace;
        }
        */

        let newLocRef = LocationList.get(newLoc);

        // This will make sure that currentLoc will always store
        // an actual location, and not an object's name or "locScene"
        if (
            newLocRef !== undefined &&
            newLocRef instanceof Location &&
            newLoc !== "locScene"
        )
        {
            player.currentLoc = newLoc;
        }

        player.prevSpace = player.currentSpace;
        player.currentSpace = newLoc;

        if (newLoc === "locScene") {
            // Save location in local storage
            if (typeof(Storage) !== "undefined") {
                localStorage.setItem("playerCurrentSpace", player.currentSpace);
                localStorage.setItem("playerPrevSpace", player.prevSpace);
                localStorage.setItem("playerCurrentLoc", player.currentLoc);
            }
        }
    },
    setInObject: function (value) {
        if (value) {
            player.inObject = true;
        } else {
            player.inObject = false;
        }
    },
    upEventID: function () {
        player.eventID += 1;
    }
};

// PIXI-related:
let PixiEnabled = false;

const updateDebugStats = function () {
    if (soundMuted) {
        $("#soundInfo").html("muted");
    }
    $("#playereventid").html(player.eventID);
    $("#playerCurrentSpace").html(player.currentSpace);
    $("#playerPrevSpace").html(player.prevSpace);
    $("#playerCurrentLoc").html(player.currentLoc);
    $("#inScene").html(player.inScene);
    $("#inObject").html(player.inObject);
    $("#menu_active").html(menuActive);
    $("#menu_tracker").html("");
    menuTracker.forEach(function (item) {
        $("#menu_tracker").append("<li>&gt; " + item + "</li>");
    });

};

const logError = function (msg) {
    console.log("ERROR: " + msg);
    $("#err").text("Program error - see console for details");
};

const logAction = function (changeObj) {
    // This function adds an entry to actionLog
    // And saves it to localStorage
    actionLog.push(changeObj);

    if (typeof (Storage) !== "undefined") {
        localStorage.setItem("actionLog", JSON.stringify(actionLog));
    }
};

const reinstateSession = function () {
    // This function restores all actions from the
    // actionLog that's stored in localStorage
    if (typeof(Storage) !== "undefined") {
        if (typeof localStorage.getItem("actionLog") === "string") {
            actionLog = JSON.parse(localStorage.getItem("actionLog"));

            // Throw the entire array through the change function to perform all changes
            if (actionLog.length > 0) {
                change(actionLog, false);
            }
        }
    }
};

const loadScene = function (url, startChoice) {
    $.getJSON(url, function (choiceList) {
        // log the url
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem("sceneURL", url);
        }

        startScene(choiceList, startChoice);
    }).fail(function () {
        logError("main.js/loadScene: scenefile not loaded: either the file doesn't exist, or there is a syntax-error in the file");
    });
};

const requestLocChange = function (newLoc) {
    /* This is a queue-system to prevent strange things from happening when a
        user clicks really fast (or clicks the same location button multiple
        times before it has faded out) */
    let newLocRef = LocationList.get(newLoc);
    if (newLocRef instanceof Location) {
        if (newLocRef.accessMsg !== "unlocked") {
            // Don't enter location when it's locked
            addFeedback(newLocRef.accessMsg);
        } else {
            // Add to locationQueue, unless it's there already
            if (locationQueue.length > 0) {
                let lastIndex = locationQueue.length -1;
                if (locationQueue[lastIndex] !== newLoc) {
                    locationQueue.push(newLoc);
                }
            } else {
                locationQueue.push(newLoc);
                enterLocation();
            }
        }
    } else {
        logError("location with ID '" + newLoc + "' not found");
    }
};

const enterLocation = function () {

    /* Entering a new location. Prioritization:
        1. When a cutscene is present: play it.
        2. When a scene is present: start it.
        3. If neither is the case: show location content */

    let disableHTML = false;
    let locationChangeInProgress = true;
    let newLoc = locationQueue[0];
    let newLocRef = LocationList.get(newLoc);

    updateDebugStats();
    player.upEventID();

    // We will have to leave 'object' mode when entering a new location
    player.inObject = false;

    if (menuActive) {
        hideMenu();
    }

    // Pixi: exit previous and enter new
    if (PixiEnabled) {
        let currentLocRef = LocationList.get(player.currentLoc);

        if (currentLocRef === undefined) {
            // This happens at the start
            if (newLocRef.pixi !== undefined) {
                if (pixies[newLocRef.pixi.id] !== undefined) {
                    if (init.pixiSettings.globalSolo) {
                        disableHTML = true;
                    } else {
                        disableHTML = pixies[newLocRef.pixi.solo];
                    }

                    // Enter
                    pixies[newLocRef.pixi.id].enter();
                }
            }
        } else if (currentLocRef !== newLocRef) {
            if (currentLocRef.pixi !== undefined) {
                if (pixies[currentLocRef.pixi.id] !== undefined) {
                    // Exit
                    pixies[currentLocRef.pixi.id].exit();
                }
            }
    
            if (newLocRef.pixi !== undefined) {
                if (pixies[newLocRef.pixi.id] !== undefined) {
                    if (init.pixiSettings.globalSolo) {
                        disableHTML = true;
                    } else {
                        disableHTML = pixies[newLocRef.pixi.solo];
                    }

                    // Enter
                    pixies[newLocRef.pixi.id].enter();
                }
            }
        }
    }

    // Change background image
    changeBg(newLocRef);

    // Change audio track
    changeTrack(newLocRef.locSnd);

    player.setLocation(newLoc);
    player.inScene = false;

    // Save location in local storage
    if (typeof(Storage) !== "undefined") {
        localStorage.setItem("playerCurrentSpace", newLoc);
    }

    // visit() increases loc.visited by 1
    newLocRef.visit();

    // 1 - Check if a cutscene needs to be played and if so: play it.
    let sceneName;
    let sceneTriggered = false;
    let sceneList = Object.keys(newLocRef.cutscenes);
    let j = 0;

    while (j < sceneList.length && !sceneTriggered) {
        sceneName = sceneList[j];

        if (newLocRef.cutscenes[sceneName]) {
            // Make changeObject that deactivates the scene when it ends:
            cutscene.changeObj = {
                    type: "cutsceneDeactivate",
                    loc: newLoc,
                    scene: sceneName
                };

            sceneTriggered = true;

            // Play scene
            cutscene.play("story/scenes/" + sceneName + ".json");
        }
        j += 1;
    }

    /* 2 - Check every scene in the location object to see if any scene
    is set to 'true'. As soon as one is found: start it. */
    if (!sceneTriggered) {
        sceneList = Object.keys(newLocRef.scenes);
        j = 0;

        while (j < sceneList.length && !sceneTriggered) {
            sceneName = sceneList[j];

            if (newLocRef.scenes[sceneName]) {
                // Deactivate this scene
                // Goes through change() for logging
                change([
                    {
                        type: "sceneDeactivate",
                        loc: newLoc,
                        scene: sceneName
                    }
                ]);

                // Load scene
                loadScene("story/scenes/" + sceneName + ".json", "start");

                sceneTriggered = true;
            }
            j += 1;
        }
    }

    // 3 - Display Location content
    // Only continue if no scene was triggered
    if (!sceneTriggered && !disableHTML) {
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
                let visitCountBeforeTimeout = newLocRef.getVisited();

                setTimeout(function () {
                    /* We need to check if the location didn't change
                    during the timeout and if player didn't re-enter the same
                    location */
                    if (
                        player.currentSpace === locBeforeTimeout &&
                        visitCountBeforeTimeout === newLocRef.getVisited()
                    ) {
                        document.getElementById(
                            "delay_" + i
                        ).style.opacity = 1;
                    }
                }, delayTime);
                delayNr += 1;
            });

            // Wait till fade-ins are done
            setTimeout(function () {
                // Entering location done
                locationChangeInProgress = false;
            }, fadeTime);
        }, fadeTime);
    }

    // Let's deal with the locationQueue
    if (sceneTriggered) {
        // Get rid of any further requested location changes
        locationQueue = [];
    } else {
        let waitUntilFinished = setInterval(function () {
            if (!locationChangeInProgress && !PixiBusy) {
                clearInterval(waitUntilFinished);

                let amnt = locationQueue.length;
                let amntToRemove = 1;
        
                /* If there is only 1 item in the queue, remove it, because
                we just ran that job. When there are more than 1, then remove
                all of them, except last one. Then trigger this function again. */
                if (amnt > 1) {
                    amntToRemove = amnt - 1;
                }
        
                locationQueue.splice(0, amntToRemove);
        
                if (locationQueue.length > 0 && locationQueue[0] !== newLoc) {
                    enterLocation();
                }
            }
        }, 100);
    }

    updateDebugStats();
};

const refreshLocation = function () {

    // We'll use player.currentLoc, which is the last
    // actual location, since this function can
    // also be called within an object
    let loc = player.currentLoc;
    let locRef = LocationList.get(loc);
    let locContent = parseLocation(locRef.content);
    let compositHTML = "";

    // visit() increases loc.visited by 1
    // this is necessary so that fade ins of sections
    // that weren't completed yet, won't result in
    // errors. In enterLocation() they get wrapped in a
    // div with id: delay_nr, but the refresh doesn't
    // do this and shows it immediately without that div.
    locRef.visit();

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
            if (ObjListLoaded && NpcListLoaded && audioModuleLoaded === "loaded") {

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
                        loc.styling,
                        loc.pixi
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

    // Taking settings from init.json
    $.getJSON("story/init.json", function (initObj) {
        init = initObj;
        initLoaded = true;
    }).fail(function () {
        logError("Init settings not loaded. This is probably caused by a syntax-error in init.json");
    });

    // TEST: get render.js
    /*
    $.getScript("story/render.js")
        .done(function () {
            // File has loaded, but isn't necessarily executed.
            // Render.js sets renderScriptExecuted to true
        })
        .fail(function () {
            console.log("Failed to load render.js");
        })
    */
};

const startStory = function (startFresh) {
    let scene;
    let sceneChoice;
    let playScene = false;
    let startAtLoc;

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
            if (menuActive) {
                hideMenu();
            }
        }

        if (isSpacebar) {
            if (init.enableInventory) {
                if (invActive) {
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
        $("#invBtn").removeClass("hide");
        $("#invBtn").addClass("inv_off");
        $("#invBtn").on("click", function () {
            openInventory();
        });
    }

    if (init.debugStats) {
        document.getElementById("debugstats").style.display = "block";
    }

    // Add clickable functions for sound button
    $("#soundBtn").click(muteSound);

    if (init.enableFSButton) {
        // Add clickable function for fullscreen button
        $("#fsBtn").removeClass("hide");
        $("#fsBtn").addClass("fs_enter");
        $("#fsBtn").click(toggleFullscreen);
    }

    document.getElementById("storyTitle").style.display = "none";
    document.querySelector("header").style.opacity = 1;

    settings = init.storySettings;

    setBgSize(init.bgSize);
    setFadeTime(init.fadeTime);
    setFeedbackTime(init.feedbackTime);
    let slowerFadeTime = fadeTime * 2;

    if (!startFresh && storedSpace !== undefined) {
        // Reload all settings from saved progess
        reinstateSession();
        if (storedSpace === "locScene" && localStorage.getItem("cutscene") === "false") {
            // Player was in the middle of a scene, let's restore a bit more
            // "false" is between quotes cause everything in localStorage is saved as a string
            player.currentLoc = localStorage.getItem("playerCurrentLoc");
            player.currentSpace = localStorage.getItem("playerCurrentSpace");
            player.prevSpace = localStorage.getItem("playerPrevSpace");
            scene = localStorage.getItem("sceneURL");
            sceneChoice = localStorage.getItem("scene");
            playScene = true;
        } else if (storedSpace === "locScene" && localStorage.getItem("cutscene") === "true") {
            // Player was in the middle of a cutscene
            // Set location to previous actual location
            startAtLoc = localStorage.getItem("playerCurrentLoc");
            player.currentSpace = localStorage.getItem("playerCurrentLoc");
            player.prevSpace =  localStorage.getItem("playerPrevSpace");
        } else {
            startAtLoc = storedSpace;
        }
    } else {
        // New playthrough
        startAtLoc = init.startLocation;
    }

    if (typeof(Storage) !== "undefined") {
        if (startFresh) {
            // First clear out possible previous settings
            localStorage.clear();
        }
        // Store version number
        localStorage.setItem("version", init.version);
        // Store sound setting
        localStorage.setItem("muteSound", soundMuted);
        // Set "cutscene" to false
        localStorage.setItem("cutscene", "false");
    }

    waitUntilLoaded = setInterval(function () {
        // We're not sure if Pixi has loaded yet, so let's check!
        if (!PixiEnabled || PixiLoaded) {
            clearInterval(waitUntilLoaded);
            setTimeout(function () {
                /*
                requestLocChange does a fadeOut & fadeIn of #text and #choices,
                but since we want a nicer, slower fade out and fade in of the
                title screen we have to do that on the entire #container.
                The fadeOut already happened after the click event.
                */
                fadeIn("container", slowerFadeTime);
            }, fadeTime);
        
            if (playScene) {
                //resume scene
                loadScene(scene, sceneChoice);
            } else {
                requestLocChange(startAtLoc);
            }
        }
    }, 100);
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

const compare = function (value1, value2, type) {
    let success = false;

    if (
        type === undefined ||
        (type !== "equal" &&
        type !== "larger" &&
        type !== "smaller")
    ) {
        type = "equal";
    }

    if (type === "equal") {
        if (value1 === value2) {
            success = true;
        }
    } else if (type === "larger") {
        if (value1 > value2) {
            success = true;
        }
    } else if (type === "smaller") {
        if (value1 < value2) {
            success = true;
        }
    }

    return success;
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
                    objRef = loc;
                } else {
                    objRef = "no_location";
                }
            }

            if (condObject.npc !== undefined) {
                condObject.obj = condObject.npc;
            }

            if (condObject.obj !== undefined) {
                // check if it's an actual obj, or "player"
                if (condObject.obj === "player") {
                    objRef = player;
                } else {
                    obj = getObj(condObject.obj);
                    objRef = obj.ref;
                }
            }

            switch (type) {
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
                success = compare(
                    value,
                    objRef.comfortLevel,
                    condObject.compare
                );

                if (success) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "state":
                if (objRef.state === value) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "storySetting":
                success = compare(
                    value,
                    settings[condObject.storySetting],
                    condObject.compare
                );

                if (success) {
                    checkArray.push(true);
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    i += 1;
                }
                break;

            case "visited":
                // Required: loc, value
                if (
                    objRef !== "no_location" &&
                    value !== undefined &&
                    typeof value === "boolean"
                ) {
                    // Both loc.visited & value need to be either true or false
                    if (
                        (objRef.getVisited() > 0 && value) ||
                        (objRef.getVisited() === 0 && !value)
                    ) {
                        checkArray.push(true);
                    } else {
                        checkArray.push(false);
                        feedback[i] = failMsg;
                        i += 1;
                    }
                } else {
                    checkArray.push(false);
                    feedback[i] = failMsg;
                    logError("invalid locID specified for visited-condition");
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

const change = function (changeArray, showFeedback = true) {
    /* This funcion handles all consequences
    Basic rule: every parameter should either be a string or an integer */

    let locRef;
    let npcRef;
    let objInfo;
    let url;
    let soundIndex;
    let feedback = [];
    let i = 0;
    let toLog = true;

    changeArray.forEach(function (changeObj) {
        let success = false;

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
            toLog = false;
            // REQUIRED: loc
            locRef = LocationList.get(changeObj.loc);
            if (
                locRef !== undefined &&
                locRef instanceof Location
            ) {
                requestLocChange(changeObj.loc);
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

        case "cutsceneDeactivate":
            // REQUIRED: locID, scene
            locRef = LocationList.get(changeObj.loc);
            if (
                locRef !== undefined &&
                locRef.cutscenes[changeObj.scene] !== undefined
            ) {
                locRef.cutscenes[changeObj.scene] = false;
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
            toLog = false;
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
            toLog = false;
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

        case "increaseStorySetting":
            // REQUIRED: storySetting, value

            if (
                changeObj.amount !== undefined &&
                typeof changeObj.amount === "number" &&
                settings[changeObj.storySetting] !== undefined
                ) {
                    settings[changeObj.storySetting] += changeObj.amount;
                    success = true;
            }
            break;

        case "playSound":
            toLog = false;
            // REQUIRED: url
            if (
                changeObj.url !== undefined &&
                typeof changeObj.url === "string"
            ) {
                url = "story/audio/" + changeObj.url;
                soundIndex = loadSound(url);
                if (soundIndex >= 0) {
                    playSound(soundIndex);
                    success = true;
                }
            }
            break;

        case "refresh":
            toLog = false;
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

        case "render":
            toLog = false;
            // REQUIRED: pixi_id, tag
            if (
                changeObj.pixi_id !== undefined &&
                typeof(changeObj.pixi_id === "string") &&
                changeObj.tag !== undefined &&
                typeof(changeObj.tag === "string")
                ) {
                    if (pixies[changeObj.pixi_id] !== undefined) {
                        pixies[changeObj.pixi_id].scene(changeObj.tag);
                        success = true;
                    }
                }
                break;

        case "sceneDeactivate":
            // REQUIRED: locID, scene
            locRef = LocationList.get(changeObj.loc);
            if (
                locRef !== undefined &&
                locRef.scenes[changeObj.scene] !== undefined
            ) {
                locRef.scenes[changeObj.scene] = false;
                success = true;
            }
            break;

        case "sceneSplice":
            // REQUIRED: npc
            // Splices the top scene of an npc
            npcRef = NpcList.get(changeObj.npc);

            if (npcRef instanceof Npc) {
                npcRef.spliceScene();
                success = true;
            }
            break;

        case "setStorySetting":
            // REQUIRED: storySetting, value
            if (settings[changeObj.storySetting] !== undefined) {
                settings[changeObj.storySetting] = changeObj.value;
                success = true;
            }
            break;

        case "triggerCutscene":
            toLog = false;
            // REQUIRED: cutscene
            if (
                changeObj.cutscene !== undefined &&
                typeof changeObj.cutscene === "string"
            ) {
                loadCutscene("story/scenes/" + changeObj.scene + ".json");
                success = true;
            }
            break;

        case "triggerScene":
            toLog = false;
            // REQUIRED: scene
            if (
                changeObj.scene !== undefined &&
                typeof changeObj.scene === "string"
            ) {
                loadScene("story/scenes/" + changeObj.scene + ".json", "start");
                success = true;
            }
            break;
        }

        if (
            success &&
            changeObj.feedback !== undefined &&
            typeof changeObj.feedback === "string" &&
            showFeedback
        ) {
            feedback[i] = changeObj.feedback;
            i += 1;
        }

        if (success) {
            if (toLog) {
                logAction(changeObj);
            }
        } else {
            logError("consequence failed: " + changeObj.type);
        }
    });

    if (feedback.length > 0) {
        compositFeedback(feedback);
    }

};

const devAutoStart = function () {
    // This function runs at the start when init.devAutoStart is true
    waitUntilLoaded = setInterval(function () {
        if (
            /* LocationList will wait with loading until
            NpcList and ObjList have loaded */
            LocationListLoaded &&
            initLoaded &&
            audioModuleLoaded === "loaded"
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
                initAudio(init.preloadAudio);
            }

            startStory(true);
        }
    }, 100);
};

$(document).ready(function () {
    let resumePossible = false;
    startButtonLocked = false;

    console.log("This story is powered by Nightswim " + VERSION);
    initStory();

    waitUntilLoaded = setInterval(function () {
        if (initLoaded && renderScriptExecuted && audioModuleLoaded === "loaded") {

            clearInterval(waitUntilLoaded);

            if (init.pixiSettings.enabled) {
                PixiEnabled = true;
            }

            // Check for saved progress
            // First check if web storage is available
            if (typeof(Storage) !== undefined) {
                if (localStorage.getItem("version") !== undefined && localStorage.getItem("playerCurrentSpace") !== undefined) {
                    console.log("Stored version is " + localStorage.getItem("version"));
                    console.log("Stored playerCurrentSpace is " + localStorage.getItem("playerCurrentSpace"));

                    // Check compatibility of the version that was used to
                    // save the progress vs. the current version of the story
                    storedVersion = localStorage.getItem("version");
                    storedSpace = localStorage.getItem("playerCurrentSpace");
                    storedMute = localStorage.getItem("muteSound");

                    if (storedMute === "false") {
                        // Convert from string (in web storage) to boolean
                        storedMute = false;
                    } else {
                        storedMute = true;
                    }

                    if (storedVersion === init.version) {
                        resumePossible = true;
                        // Recall the saved state of the sound mute button
                        init.muteSound = storedMute;
                    } else {
                        // Check if the storedVersion is in init.compatibleVersions
                        let i = 0;
                        while (i < init.compatibleVersions.length) {
                            if (storedVersion === init.compatibleVersions[i]) {
                                resumePossible = true;
                                init.muteSound = storedMute;
                            }
                            i += 1;
                        }
                    }
                }
            }

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
                devAutoStart();
            }

            if (resumePossible) {
                // Show a button with "Continue with previous playthrough" and
                // "Restart story"
                $("#choices").append("<li><button id=\"continueButton\" class=\"std\">Continue previous playthrough</button></li>");
                $("#choices").append("<li><button id=\"startButton\" class=\"std\">Restart the story</button></li>");

                // Make the continue button clickable
                $("#continueButton").one("click", function () {
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
                    if (!init.devAutoStart && !startButtonLocked) {
                        // startButtonLocked prevents users from clicking both
                        // the continue and restart buttons
                        startButtonLocked = true;
                        waitUntilLoaded = setInterval(function () {
                            if (
                                /* LocationList will wait with loading until
                                NpcList and ObjList have loaded */
                                LocationListLoaded &&
                                initLoaded &&
                                audioModuleLoaded === "loaded"
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
                                    init.preLoadAudio.length > 0 &&
                                    !init.muteSound
                                ) {
                                    preLoadAudio = init.preLoadAudio;
                                } else {
                                    preLoadAudio = [];
                                }

                                initAudio(preLoadAudio);

                                let startLocRef;

                                if (storedSpace === "locScene") {
                                    // Doesn't actually exist, so get next audio
                                    let nextLoc = localStorage.getItem("playerCurrentLoc");
                                    startLocRef = LocationList.get(nextLoc);
                                } else {
                                    startLocRef = LocationList.get(storedSpace);
                                }

                                // Retrieve audio object for this location from audio module. 
                                firstAudioTrack = getAudioTrack(startLocRef.locSnd);
                                setCurrentTrack(firstAudioTrack);

                                if (!init.muteSound) {
                                    // We had to wait for this until initAudio was called
                                    if (firstAudioTrack.filename !== "no_sound") {
                                        /*
                                        We have to start playback here, or else
                                        Safari will not count clicking "Lets go" as a
                                        user interaction that can start sound playback.
                                        */
                                        firstAudioTrack.howl.load();
                                        console.log("Loading audiotrack: " +
                                            firstAudioTrack.filename);
                                        firstAudioTrack.howl.volume(1);
                                        firstAudioTrack.howl.play();
                                    }
                                }

                                fadeOut("container", fadeTime);
                                setTimeout(function () { startStory(false); }, fadeTime);
                            }
                        }, 100);
                    }
                });
            } else {
                // Show only the start button
                $("#choices").append("<li><button id=\"startButton\" class=\"std\">Let's go!</button></li>");
            }

            // Make the (re)start button clickable
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
                if (!init.devAutoStart && !startButtonLocked) {
                    // startButtonLocked prevents users from clicking both
                    // the continue and restart buttons
                    startButtonLocked = true;
                    waitUntilLoaded = setInterval(function () {
                        if (
                            /* LocationList will wait with loading until
                            NpcList and ObjList have loaded */
                            LocationListLoaded &&
                            initLoaded &&
                            audioModuleLoaded === "loaded"
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
                                init.preLoadAudio.length > 0 &&
                                !init.muteSound
                            ) {
                                preLoadAudio = init.preLoadAudio;
                            } else {
                                preLoadAudio = [];
                            }

                            initAudio(preLoadAudio);

                            let startLocRef = LocationList.get(init.startLocation);
                            // Retrieve audio object for this location from audio module.
                            firstAudioTrack = getAudioTrack(startLocRef.locSnd);
                            setCurrentTrack(firstAudioTrack);

                            if (!init.muteSound) {
                                // We had to wait for this until initAudio was called
                                
                                if (firstAudioTrack.filename !== "no_sound") {
                                    /*
                                    We have to start playback here, or else
                                    Safari will not count clicking "Lets go" as a
                                    user interaction that can start sound playback.
                                    */
                                    firstAudioTrack.howl.load();
                                    console.log("Loading first audiotrack: " +
                                        firstAudioTrack.filename);
                                    firstAudioTrack.howl.volume(1);
                                    firstAudioTrack.howl.play();
                                }
                            }

                            fadeOut("container", fadeTime);
                            setTimeout(function () { startStory(true); }, fadeTime);
                        }
                    }, 100);
                }
            });
        }
    }, 100);
});

export default "Main Story Module";
export {
    cutscene,
    player,
    requestLocChange,
    refreshLocation,
    loadScene,
    directAction,
    updateDebugStats,
    checkConditions,
    change,
    logError,
    Inventory
};