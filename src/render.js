// Let's load and initialize Pixi!
let pixiLoaded = false;
let pixiBusy = false;

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

let textureArray = ["story/textures/bird.png"];

let loader = PIXI.Loader.shared;

loader
    .add(textureArray)
    .on("progress", function (loader, resource) {
        console.log("Loading: " + resource.url + " Progress: " + loader.progress + "%");
    })
    .load(function (loader, resources) {
        // Done loading
        pixiLoaded = true;
        document.body.appendChild(app.view);
        $("canvas").fadeTo(1000, 1);

    });

$(window).resize(function () {
    app.renderer.resize(window.innerWidth, window.innerHeight);
});

let pixies = {
    apt: {
        enter: function () {
            console.log("Entering PIXI stage of Apartment");
            app.renderer.backgroundColor = 0x0000FF;
        },
        exit: function () {
        },
        scene: function (tag, text) { }
    },
    street: {
        enter: function () {
            console.log("Entering PIXI stage of Street");
            app.renderer.backgroundColor = 0xCC00CC;
        },
        exit: function () {
        },
        scene: function (tag, text) { }
    },
    forest: {
        enter: function () {
            console.log("Entering PIXI stage of Forest");
            app.renderer.backgroundColor = 0x00AA00;
        },
        exit: function () {
        },
        scene: function (tag, text) { }
    }
};

console.log("Render script loaded and executed");

export {
    pixiLoaded,
    pixiBusy,
    pixies
}