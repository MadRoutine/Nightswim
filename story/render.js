// Let's load and initialize Pixi!
let PixiLoaded = false;

let app = new PIXI.Application({
    resolution: window.devicePixelRatio || 1,
    transparent: false
});
app.renderer.backgroundColor = 0x444444;
app.renderer.view.style.position = "absolute";
app.renderer.view.style.display = "block";
app.renderer.view.style.top = 0;
app.renderer.view.style.left = 0;
app.renderer.resize(window.innerWidth, window.innerHeight);

let textureArray = ["bird.png"];

let loader = PIXI.Loader.shared;

loader
    .add(textureArray)
    .on("progress", function (loader, resource) {
        console.log("Loading: " + resource.url + " Progress: " + loader.progress + "%");
    })
    .load(function (loader, resources) {
        // Done loading
        PixiLoaded = true;
        document.body.appendChild(app.view);
        $("canvas").fadeTo(1000, 1);

    });

let pixies = {
    apt: {
        enter: function () {
            console.log("Entering PIXI stage of Apartment");
            app.renderer.backgroundColor = 0x0000FF;
        },
        exit: function () {
            console.log("Exiting PIXI stage of Apartment");
        },
        scene: function (tag) { }
    },
    street: {
        enter: function () {
            console.log("Entering PIXI stage of Street");
            app.renderer.backgroundColor = 0xFF00FF;
        },
        exit: function () {
            console.log("Exiting PIXI stage of Street");
        },
        scene: function (tag) { }
    },
    forest: {
        enter: function () {
            console.log("Entering PIXI stage of Forest");
            app.renderer.backgroundColor = 0x00FF00;
        },
        exit: function () {
            console.log("Exiting PIXI stage of Forest");
        },
        scene: function (tag) { }
    }
};

let renderScriptExecuted = true;
console.log("Render script loaded and executed");