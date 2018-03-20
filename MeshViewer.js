"use strict"

// register the application module
b4w.register("MeshViewer_main", function(exports, require) {

// import modules used by the app
var m_app       = require("app");
var m_cfg       = require("config");
var m_data      = require("data");
var m_preloader = require("preloader");
var m_ver       = require("version");
var m_geo       = require("geometry");
var m_scenes    = require("scenes");
var m_transform = require("transform");
var m_obj       = require("objects");


// detect application mode
var DEBUG = (m_ver.type() == "DEBUG");

// automatically detect assets path
var APP_ASSETS_PATH = m_cfg.get_assets_path("MeshViewer");

/**
 * export the method to initialize the app (called at the bottom of this file)
 */
exports.init = function() {
    m_app.init({
        canvas_container_id: "main_canvas_container",
        callback: init_cb,
        autoresize: true,
        quality: m_cfg.P_HIGH,
    });
}

/**
 * callback executed when the app is initialized
 */
function init_cb(canvas_elem, success) {

    if (!success) {
        console.log("b4w init failure");
        return;
    }

    m_preloader.create_preloader();

    // ignore right-click on the canvas element
    canvas_elem.oncontextmenu = function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };

    load();
}

/**
 * load the scene data
 */
function load() {
    m_data.load(APP_ASSETS_PATH + "MeshViewer.json", load_cb, preloader_cb);
}

/**
 * update the app's preloader
 */
function preloader_cb(percentage) {
    m_preloader.update_preloader(percentage);
    $("#rideau").css("width", 517 - 5.17*percentage);
    if (percentage == 100) {
        $("#clickSomewhere").css("opacity",1);
        $("#loadingScreen").css("cursor","pointer");
        $("#loadingScreen").click(function(){
          $(this).fadeOut(1000);
        });
        return;
    }
}

/**
 * callback executed when the scene data is loaded
 */
function load_cb(data_id, success) {

    if (!success) {
        console.log("b4w load failure");
        return;
    }

    m_app.enable_camera_controls();

    // place your code here
    document.getElementById('fileinput').addEventListener('change', meshButtonCallback, false);
    document.getElementById('solinput').addEventListener('change', solButtonCallback, false);
    $("#toggleColor").click(toggleColor);

    $("#toggleInfo").click(function(){$("#modal").addClass("is-active")});
    $(".delete, .modal-background").click(function(e){
      $("#modal, #inriaModal").removeClass("is-active");
    });
    $("#www").click(function(){
      $("#inriaModal").addClass("is-active");
      $("#go").click(function(){
        $("#inriaModal").removeClass("is-active");
        loadFromURL($("#inriaModal input").val());
      });
    });
    $("#normals").click(invertNormals);
}

function loadFromURL(meshUrl){
  var url  = 'http://allorigins.me/get?url=' + encodeURIComponent(meshUrl) + '&callback=?';
  $("#meshInput .file-icon").html("<i class='fas fa-circle-notch fa-spin'></i>");
  toggleOpacity();
  $.getJSON(
    url,
    function(data){
      parseMesh(data.contents, meshUrl);
      $("#meshInput .file-icon").html("<i class='fas fa-upload'></i>");
      toggleOpacity();
    }
  );
}


//API functions, corresponding to the file input buttons
function meshButtonCallback(evt) {
  var f = evt.target.files[0];
  if (f) {
    var r = new FileReader();
    $("#meshInput .file-icon").html("<i class='fas fa-circle-notch fa-spin'></i>");
    toggleOpacity();
    r.onload = function(e) {
      $("#meshInput .file-icon").html("<i class='fas fa-upload'></i>");
      toggleOpacity();
      parseMesh(e.target.result, f.name);
    }
    r.readAsText(f);
  }
  else {
    alert("Failed to load file");
  }
}
function solButtonCallback(evt) {
  var f = evt.target.files[0];
  if (f) {
    activeMesh.solFile = f.name;
    var r = new FileReader();
    $("#solInput .file-icon").html("<i class='fas fa-circle-notch fa-spin'></i>");
    toggleOpacity();
    r.onload = function(e) {
      $("#solInput .file-icon").html("<i class='fas fa-upload'></i>");
      toggleOpacity();
      parseSol(e.target.result);
    }
    r.readAsText(f);
  }
  else {
    alert("Failed to load file");
  }
}
function parseMesh(lines, name){
  activeMesh = new meditMesh(lines.split("\n"));
  activeMesh.meshFile=name;
  var obj = m_scenes.get_object_by_name("cube");
  m_geo.override_geometry(
    obj,
    "logo",
    activeMesh.ibo,
    activeMesh.vbo,
    false
  );
  m_geo.update_vertex_array(obj, "logo", "a_color", activeMesh.cbo);
  m_geo.update_vertex_array(obj, "logo", "a_normal", activeMesh.nbo);
  m_obj.update_boundings(obj);
  m_scenes.update_scene_materials_params();
  $("#meshInfo, #solInfo").html("");
  $("#meshInfo").append("<b>Geometry:</b><br>");
  $("#meshInfo").append("&emsp;File:  " + activeMesh.meshFile + "<br>");
  $("#meshInfo").append("&emsp;Vertices:  " + activeMesh.verts.length + "<br>");
  $("#meshInfo").append("&emsp;Triangles: " + activeMesh.tris.length);
}
function parseSol(lines){
  activeMesh.readSol(lines.split("\n"));
  var obj = m_scenes.get_object_by_name("cube");
  m_geo.update_vertex_array(obj, "logo", "a_color", activeMesh.cbo);
  $("#solInfo").html("");
  $("#solInfo").append("<b>Solution field:</b><br>");
  $("#solInfo").append("&emsp;File:  " + activeMesh.solFile + "<br>");
  $("#solInfo").append("&emsp;Scalars: " + activeMesh.scalars.length + "<br>");
}

function meshCreationError(message){
  console.log(message);
  $("#meshInput").removeClass("is-info");
  $("#meshInput").addClass("is-danger");
}
function meditMesh (lines){
  //Initialization
  try{
    this.meshFile = "";
    this.solFile  = "";
    this.lines    = lines;
    this.keywords = ["Vertices", "Triangles", "Quadrilaterals","Tetrahedra","SolAtVertices"];
    this.done     = [];
    this.found    = [0,0,0,0,0];
    this.begin    = [0,0,0,0,0];
    this.numItems = [0,0,0,0,0];
    this.offset   = 0;
    this.get_infos();
  }
  catch(e){
    meshCreationError("Error during the mesh initialization");
    return;
  }

  //Vertices reading
  try{
    if(this.numItems[0]){
      this.verts = this.readArray(0,4);
      this.verts = this.verts.map(function(vert){
        var s = vert.trim().split(/[\s,]+/);
        return [parseFloat(s[0]), parseFloat(s[1]), parseFloat(s[2])];
      });
    }
  }
  catch(e){
    meshCreationError("Error reading vertices");
    return;
  }

  //Triangles reading
  try{
    if(this.numItems[1]){
      this.tris  = this.readArray(1,4);
      this.tris = this.tris.map(function(tri){
        var s = tri.trim().split(/[\s,]+/);
        return [parseInt(s[0],10)-1, parseInt(s[1],10)-1, parseInt(s[2],10)-1]
      });
    }
  }
  catch(e){
    meshCreationError("Error reading triangles");
    return;
  }

  //Computing the position and scale factor
  try{
    var min = [1e8, 1e8, 1e8];
    var max = [-1e8, -1e8, -1e8];
    for (var i = 0 ; i < this.verts.length ; i++){
      for(var j = 0 ; j < 3 ; j++){
        min[j] = Math.min(min[j], this.verts[i][j]);
        max[j] = Math.max(max[j], this.verts[i][j]);
      }
    }
    var avg = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
    var siz = Math.max( Math.max(max[0]-min[0], max[1]-min[1]) , max[2]-min[2] );
    var newC = [0,0,0];
    siz/=2.0;
  }
  catch(e){
    meshCreationError("Error computing the mesh position");
    return;
  }

  this.shading = "FLAT";
  if(this.shading === "SMOOTH"){
    this.vbo = new Float32Array(3*this.verts.length);
    for (var i=0; i<this.verts.length; ++i) {
      for(var j = 0 ; j < 3 ; j++){
        this.vbo[3*i+j] = (1.0/siz) * (this.verts[i][j] - avg[j]) + newC[j];
      }
    }
    this.ibo = new Uint32Array(3*this.tris.length);
    for (var i=0; i<this.tris.length; ++i) {
      for(var j = 0 ; j < 3 ; j++){
        this.ibo[3*i+j] = this.tris[i][j];
      }
    }
    this.cbo = new Float32Array(3*this.verts.length);
    for (var i=0; i<this.verts.length; ++i) {
      var col = HSVtoRGB((1.0*i)/this.verts.length,1,1);
      this.cbo[3*i+0] = 1;
      this.cbo[3*i+1] = 1;
      this.cbo[3*i+2] = 1;
    }
    this.nbo=[];
  }
  else{
    var nT = this.tris.length;
    this.ibo = new Uint32Array(3*nT);
    this.vbo = new Float32Array(9*nT);
    for(var i = 0 ; i < nT ; i++){
      //premier vertex
      for(var j = 0 ; j < 3 ; j++){
        this.ibo[3*i+j] = 3*i+j;
        for(var k = 0 ; k < 3 ; k++){
          var coo = this.verts[this.tris[i][j]][k];
          this.vbo[9*i + 3*j + k] = (1.0/siz) * (coo - avg[k]) + newC[k];
        }
      }
    }
    this.cbo = new Float32Array(9*nT);
    for (var i=0; i<3*nT; ++i) {
      this.cbo[3*i+0] = 1;
      this.cbo[3*i+1] = 1;
      this.cbo[3*i+2] = 1;
    }
    this.nbo = new Float32Array(9*nT);
    for(var i = 0 ; i < nT ; i++){
      var n = triangleNormal(
        this.vbo[9*i + 0],
        this.vbo[9*i + 1],
        this.vbo[9*i + 2],
        this.vbo[9*i + 3],
        this.vbo[9*i + 4],
        this.vbo[9*i + 5],
        this.vbo[9*i + 6],
        this.vbo[9*i + 7],
        this.vbo[9*i + 8]
      );
      this.nbo[9*i + 0] = n[0];
      this.nbo[9*i + 1] = n[1];
      this.nbo[9*i + 2] = n[2];
      this.nbo[9*i + 3] = n[0];
      this.nbo[9*i + 4] = n[1];
      this.nbo[9*i + 5] = n[2];
      this.nbo[9*i + 6] = n[0];
      this.nbo[9*i + 7] = n[1];
      this.nbo[9*i + 8] = n[2];
    }
  }


};
meditMesh.prototype.get_infos = function(){
  for(var k in this.keywords){
    for(var i = this.offset ; i < this.lines.length ; i++){
      if(this.analyse(i, this.lines[i])){
        break;
      }
    }
  }
}
meditMesh.prototype.analyse = function(index, line){
  for(var k = 0 ; k < this.keywords.length ; k++){
    var kwd = this.keywords[k];
    if( this.found[k] &&  !this.done.includes(kwd)){
      this.numItems[k] = parseInt(line);
      this.offset += this.numItems[k];
      this.found[k] = 0;
      this.done.push(kwd);
      return 1;
    }
    if(line.includes(kwd)){
      if(!this.done.includes(kwd) && line[0]!="#"){
        if(kwd == "Vertices" && line.trim()=="SolAtVertices"){
          var a = 1;
        }
        else{
          this.begin[k] = (kwd=="SolAtVertices") ?  index+3 : index+2;
          this.found[k] = 1;
        }
      }
    }
  }
}
meditMesh.prototype.readArray = function(ind, dim){
  //Allows for searching through n empty lines
  var maxNumberOfEmptylines = 20
  for(var i = 0 ; i < maxNumberOfEmptylines ; i++){
    var firstValidLine = this.lines[this.begin[ind]].trim();
    if(firstValidLine == ""){
      this.begin[ind]+=1;
    }
    else{
      break;
    }
  }
  try{
    return this.lines.slice(this.begin[ind], this.begin[ind] + this.numItems[ind]);
  }
  catch(e){
    console.log("Error reading array");
  }
}
function HSVtoRGB(h, s, v) {
  /*
  hsv between 0 and 1
  */
  var r, g, b, i, f, p, q, t;
  if (arguments.length === 1) {
      s = h.s, v = h.v, h = h.h;
  }
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
  }
  return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
  };
}
meditMesh.prototype.readSol = function(lines){
  for(var i = 0 ; i < lines.length ; i++){
    if( lines[i].includes("SolAtVertices") ){
      var nSol = parseInt(lines[i+1]);
      var begin = i+3;
      var emptyLine = true;
      while(emptyLine){
        if(lines[begin].trim() === ""){
          begin += 1;
        }
        else{
          emptyLine = false;
        }
      }
      var dim = lines[begin].trim().split(/[\s,]+/).length;
      console.log(lines[begin], dim);
      var scals = lines.slice(begin, begin + nSol);
      //Si le fichier solution est plein de scalaires
      if(dim==1){
        this.scalars = scals.map(function(scalar){
          var s = scalar.trim();
          return parseFloat(s);
        });
      }
      //Si le fichier est plein de vecteurs, on prend leur norme
      if(dim==3){
        this.scalars = scals.map(function(scalar){
          var s = scalar.trim();
          var vec = scalar.split(/[\s,]+/).map(function(coord){
            return parseFloat(coord);
          });
          var norm = Math.sqrt(Math.pow(vec[0],2) + Math.pow(vec[1],2) + Math.pow(vec[2],2));
          return norm;
        });
      }
      //Si le fichier solution est plein de scalaires et de vecteurs, on prend le scalaire
      if(dim==4){
        this.scalars = scals.map(function(scalar){
          var s = scalar.trim().split(/[\s,]+/)[3];
          return parseFloat(s);
        });
      }

      break;
    }
  }
  this.solRange = [Math.min.apply(Math, this.scalars), Math.max.apply(Math, this.scalars)];

  //Cas flat
  if(this.shading=="FLAT"){
    for(var i = 0 ; i < this.tris.length ; i++){
      for(var j = 0 ; j < 3 ; j++){
        var vertInd = this.tris[i][j];
        var mapped = 1-mapSol(this.scalars[vertInd], this.solRange);
        var rgb = HSVtoRGB(0.6666*mapped, 1, 1);
        this.cbo[9*i + 3*j + 0 ] = (rgb.r/255).toPrecision(3);
        this.cbo[9*i + 3*j + 1 ] = (rgb.g/255).toPrecision(3);
        this.cbo[9*i + 3*j + 2 ] = (rgb.b/255).toPrecision(3);
      }
    }
  }
  else{
    for(var i = 0 ; i < this.scalars.length ; i++){
      var mapped = 1-mapSol(this.scalars[i], this.solRange);
      var rgb = HSVtoRGB(0.6666*mapped, 1, 1);
      this.cbo[3*i + 0] = (rgb.r/255).toPrecision(3);
      this.cbo[3*i + 1] = (rgb.g/255).toPrecision(3)
      this.cbo[3*i + 2] = (rgb.b/255).toPrecision(3)
    }
  }
}
function triangleNormal(x0, y0, z0, x1, y1, z1, x2, y2, z2, output) {
  if (!output) output = []

  var p1x = x1 - x0
  var p1y = y1 - y0
  var p1z = z1 - z0

  var p2x = x2 - x0
  var p2y = y2 - y0
  var p2z = z2 - z0

  var p3x = p1y * p2z - p1z * p2y
  var p3y = p1z * p2x - p1x * p2z
  var p3z = p1x * p2y - p1y * p2x

  var mag = Math.sqrt(p3x * p3x + p3y * p3y + p3z * p3z)
  if (mag === 0) {
    output[0] = 0
    output[1] = 0
    output[2] = 0
  } else {
    output[0] = p3x / mag
    output[1] = p3y / mag
    output[2] = p3z / mag
  }

  return output
}
var activeMesh = null;

function mapSol(x, range){
  return (x-range[0]) / (range[1]-range[0]);
}

var isColored = 1;
function toggleColor(){

  var obj = m_scenes.get_object_by_name("cube");
  if(isColored == 1){
    var tempCBO = new Float32Array(activeMesh.cbo.length).fill(1.);
    m_geo.update_vertex_array(obj, "logo", "a_color", tempCBO);
    isColored=0;
  }
  else{
    m_geo.update_vertex_array(obj, "logo", "a_color", activeMesh.cbo);
    isColored=1;
  }
}

var isHidden = 0;
function toggleOpacity(){
  if(isHidden == 0){
    $("#main_canvas_container").css("opacity", 0.2);
    isHidden=1;
  }
  else{
    $("#main_canvas_container").css("opacity", 1);
    isHidden=0;
  }
}

function invertNormals(){
  for(var i = 0 ; i < activeMesh.ibo.length/3 ; i++){
    var i0 = activeMesh.ibo[3*i];
    activeMesh.ibo[3*i] = activeMesh.ibo[3*i + 1];
    activeMesh.ibo[3*i + 1] = i0;
  }
  var obj = m_scenes.get_object_by_name("cube");
  m_geo.override_geometry(obj, "logo", activeMesh.ibo, activeMesh.vbo, false);
  if(isColored){ m_geo.update_vertex_array(obj, "logo", "a_color", activeMesh.cbo); }
  else{
    var tmp = new Float32Array(activeMesh.cbo.length).fill(1.);
    m_geo.update_vertex_array(obj, "logo", "a_color", tmp);
  }
}


});

// import the app module and start the app by calling the init method
b4w.require("MeshViewer_main").init();
