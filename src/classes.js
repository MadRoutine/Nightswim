import {addFeedback} from "./display.js";
import {menuTracker, openMenu, refreshMenu, useOnMode} from "./menu.js";
import {
    change,
    loadScene,
    player,
    logError,
    checkConditions,
    Inventory
} from "./main.js";

let LocationList = new Map();
let NpcList = new Map();
let ObjList = new Map();

class Location {
    constructor(
        locID, name, accessMsg, locImg, locSnd, cutscenes, scenes, content,
        styling, pixi
    ) {
        this.name = name;
        this.accessMsg = accessMsg;
        this.locSnd = locSnd;
        this.locImg = locImg;
        this.cutscenes = cutscenes;
        this.scenes = scenes;
        this.content = content;
        this.styling = styling;
        this.pixi = pixi;
        this.visited = 0;

        LocationList.set(locID, this);
        return this;
    }

    setAccessMsg (newMsg) {
        if (newMsg !== undefined && typeof newMsg === "string") {
            this.accessMsg = newMsg;
            return true;
        } else {
            return false;
        }
    }

    setLocImg (newImg) {
        if (newImg !== undefined && typeof newImg === "string") {
            this.locImg = newImg;
            return true;
        } else {
            return false;
        }
    }

    setLocSnd (newSnd) {
        if (newSnd !== undefined && typeof newSnd === "string") {
            this.locSnd = newSnd;
            return true;
        } else {
            return false;
        }
    }

    visit () {
        this.visited += 1;
    }

    getVisited () {
        return this.visited;
    }

}

class SuperObj {
    constructor(name, descr, loc, state, interactions, receive) {
        this.name = name;
        this.descr = descr;
        this.loc = loc;
        this.state = state;
        this.interactions = interactions;
        this.receive = receive;
    }

    setInteraction (index, value) {
        let activated = this.interactions[index].activated;

        if (
            activated !== undefined && typeof activated === "boolean" &&
            value !== undefined && typeof value === "boolean"
        ) {
            activated = value;
            return true;
        } else {
            return false;
        }
    }

    setDescr (newDescr) {
        if (
            newDescr !== undefined && typeof newDescr === "string" &&
            newDescr !== ""
        ) {
            this.descr = newDescr;
            return true;
        } else {
            return false;
        }
    }

    setLoc (newLoc) {

        let locRef = LocationList.get(newLoc);

        if (locRef !== undefined && locRef instanceof Location) {
            this.loc = newLoc;
            return true;
        } else {
            return false;
        }
    }

    setState (newState) {
        if (
            newState !== undefined && typeof newState === "string" &&
            newState !== ""
        ) {
            this.state = newState;
            return true;
        } else {
            return false;
        }
    }

    receiveFromObj (source) {
        // Go through all receive.from's and check if they match with source
        let i = 0;
        let found = false;

        while (i < this.receive.length) {
            let definedSrc = this.receive[i];

            if (definedSrc.from === source) {
                found = true;
                // Check if conditions are okay, and if yes, run consequences
                if (checkConditions(definedSrc.conditions, true)) {
                    // Execute consequences
                    change(definedSrc.consequences);
                    addFeedback(definedSrc.feedback);
                }
                break;
            }
            i += 1;
        }

        if (!found) {
            addFeedback("Can't use " + source + " on " + this.name);
        }
    }
}

class Npc extends SuperObj {

    constructor (
        name, descr, loc, state, interactions, receive, comfortLevel, scenes
    ) {
        super(name, descr, loc, state, interactions, receive);
        this.comfortLevel = comfortLevel;
        this.interactions = interactions;

        /* Slightly different scene-system here compared to Location objects:
        only active scenes are queued here. */
        this.sceneQueue = scenes;

        NpcList.set(name, this);
        return this;
    }

    addScene (scene) {

        let url;

        if (scene !== undefined && typeof scene === "string") {
            url = "scenes/" + url + ".json";
            $.get(url).done(function () {
                sceneQueue.push(scene);
                return true;
            }).fail(function() {
                logError("constructor.js/addScene: " +
                "scenefile not found");
                return false;
            });
        }
    }

    spliceScene () {
        this.sceneQueue.splice(0, 1);
    }

    interact (index, directAction) {

        let interaction = this.interactions[index];
        let condList = this.interactions[index].conditions;
        let scene;

        if (directAction === undefined) {
            directAction = false;
        }

        // Execute the consequences when conditions are met
        if (checkConditions(condList, true)) {

            // Execute consequences
            change(interaction.consequences);

            // "talk" gets a special treatment
            if (interaction.type === "talk") {
                /* Run scene if there is any queued up (which should
                be the case, because else the talk button woudn't have
                shown up) */
                if (this.sceneQueue.length > 0) {
                    scene = this.sceneQueue[0];

                    /* Take the first scene in the queue at index 0 and
                    remove it from queue; we have to route this through
                    change() so that it gets logged for savegames */
                    change([
                        {
                            type: "sceneSplice",
                            npc: this.name
                        }
                    ]);

                    // Load scene
                    loadScene("story/scenes/" + scene + ".json", "start");
                }
            } else {

                if (!directAction) {
                    /* An interaction that wasn't triggered because of a
                    directAction was issued from the interaction menu.
                    Therefore player.currentSpace will hold the name ID of the
                    object that was open in the menu when the player clicked
                    this object to interact with. */
                    openMenu(player.currentSpace);
                }

                addFeedback(interaction.feedback);

                // Remove interaction
                this.interactions.splice(index, 1);
            }
        }
    }

}

class Obj extends SuperObj {

    constructor(
        name, descr, loc, state, interactions, receive, content, singleUse
    ) {
        super(name, descr, loc, state, interactions, receive);
        this.content = content;
        this.singleUse = singleUse;
        ObjList.set(name, this);
        return this;
    }

    autoClose () {
        let i = 0;
        while (i < this.interactions.length) {

            let interaction = this.interactions[i];

            if (interaction.type === "close") {
                // Change state to 'close'
                this.state = "closed";

                interaction.type = "open";
                interaction.button = "Open " + this.name;

                let descr_prev = this.descr;
                this.descr = this.content;
                this.content = descr_prev;

                console.log("auto-closed " + this.name);
            }

            i += 1;
        }
    }

    setInteraction (index, value) {
        let activated = this.interactions[index].activated;

        if (
            activated !== undefined && typeof activated === "boolean" &&
            value !== undefined && typeof value === "boolean"
        ) {
            activated = value;
            return true;
        } else {
            return false;
        }
    }

    interact (index, directAction) {

        let interaction = this.interactions[index];
        let condList = this.interactions[index].conditions;
        let triggerUseOnMode = false;

        /* An interaction that wasn't triggered because of a
        directAction was issued from the interaction menu.
        Therefore player.currentSpace will hold the name ID of the
        object that was open in the menu when the player clicked
        this object to interact with. */
        let newLocation = player.currentSpace;

        if (directAction === undefined) {
            directAction = false;
        }

        // Execute the consequences when conditions are met
        if (checkConditions(condList, true)) {

            let descr_prev;

            // Some interactions get a special treatment:
            // "open", "close", "take" and "use on"
            switch (interaction.type) {
            case "open":
                // Check if state allows opening. State must be: closed.
                if (this.state === "closed") {

                    // Change state to 'open'
                    this.state = "open";

                    interaction.type = "close";
                    interaction.button = "Close " + this.name;

                    descr_prev = this.descr;
                    this.descr = this.content;
                    this.content = descr_prev;

                    newLocation = this.name;
                }
                break;

            case "close":
                // Check if state allows closing. State must be: open.
                if (this.state === "open") {

                    // Change state to 'close'
                    this.state = "closed";

                    interaction.type = "open";
                    interaction.button = "Open " + this.name;

                    descr_prev = this.descr;
                    this.descr = this.content;
                    this.content = descr_prev;

                    /* When there are previous items in the
                    menuTracker, the close button also functions
                    as a BACK-button */

                    if (menuTracker.length > 1) {
                        let prevObjectIndex = menuTracker.length - 2;
                        let prevObjID = menuTracker[prevObjectIndex];
                        newLocation = prevObjID;
                    }
                }
                break;

            case "take":
                // Change state to 'taken'
                this.state = "taken";
                this.loc = "player";
                interaction.activated = false;
                interaction.button = "Put " + this.name + " back";
                // Put in inventory
                Inventory.set(this.name, true);
                break;

            case "use on":
                /* Story needs to be set to "useOnMode".
                We need to do this later on, though, because
                the interaction menu needs to be closed first.*/
                triggerUseOnMode = true;
                break;

            /* Maybe someday
            case "putback":
                // Change state to 'normal'
                this.state = "normal";
                this.loc = player.prevSpace;
                interaction.type = "take";
                interaction.button = "Take " + this.name;
                // Remove from inventory
                Inventory.delete(this.name);
                break;
                */

            }

            // Execute consequences
            change(interaction.consequences);

            // When singleUse is true, all interactions need to be deactivated
            if (this.singleUse) {
                let i = 0;
                while (i < this.interactions.length) {
                    let interaction = this.interactions[i];
                    interaction.activated = false;
                    i += 1;
                }
            }

            if (!directAction && !triggerUseOnMode) {

                if (newLocation === player.inventory.name) {
                    openInventory();
                } else {
                    openMenu(newLocation);
                }

            } else if (triggerUseOnMode) {
                useOnMode(this.name);
            }

            addFeedback(interaction.feedback);
        }

    }
}

const getObj = function (objID) {

    let objRef;
    let objType;

    objRef = NpcList.get(objID);

    if (objRef instanceof Npc) {
        objType = "Npc";
    } else {
        objRef = ObjList.get(objID);
        if (objRef instanceof Obj) {
            objType = "Obj";
        } else {
            objType = "unknown";
            objRef = null;
        }
    }

    return {
        type: objType,
        ref: objRef
    };
};

export default "loaded";
export {
    getObj,
    LocationList,
    Location,
    NpcList,
    Npc,
    ObjList,
    Obj
};