/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
var map;
var luren;
var mapLayers;

define(["dojo/ready", "dojo/_base/declare", "dojo/_base/lang",
  "dojo/dom-construct", "dojo/query", "dojo/on", "dojo/dom-attr",
  "dojo/_base/Color",
  "esri/renderers/SimpleRenderer",
  "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol",
  "esri/tasks/FeatureSet",
  "esri/layers/FeatureLayer",
  "esri/tasks/query",
  "esri/renderers/Renderer",
  "esri/renderers/UniqueValueRenderer",
  "esri/dijit/PopupTemplate",
  "esri/InfoTemplate",
  "esri/graphic",
  "esri/tasks/Geoprocessor",
  "esri/urlUtils", "esri/graphicsUtils",
  "esri/arcgis/utils", "dojo/dom", "dojo/dom-class"

], function(
  ready,
  declare,
  lang,
  domConstruct, query, on, domAttr,
  Color,
  SimpleRenderer,
  SimpleFillSymbol, SimpleLineSymbol,
  FeatureSet,
  FeatureLayer,
  Query,
  Renderer,
  UniqueValueRenderer,
  PopupTemplate,
  InfoTemplate,
  Graphic,
  Geoprocessor,
  urlUtils, graphicsUtils,
  arcgisUtils,
  dom,
  domClass
) {
  return declare(null, {
    config: {},
    startup: function(config) {
      // config will contain application and user defined info for the template such as i18n strings, the web map id
      // and application id
      // any url parameters and any application specific configuration information.

      if (config) {
        this.config = config;
        // document ready
        ready(lang.hitch(this, function() {
          //supply either the webmap id or, if available, the item info
          var itemInfo = this.config.itemInfo || this.config.webmap;
          this._createWebMap(itemInfo);
        }));
      } else {
        var error = new Error("Main:: Config is not defined");
        this.reportError(error);
      }
    },
    reportError: function(error) {
      // remove loading class from body
      domClass.remove(document.body, "app-loading");
      domClass.add(document.body, "app-error");
      // an error occurred - notify the user. In this example we pull the string from the
      // resource.js file located in the nls folder because we've set the application up
      // for localization. If you don't need to support multiple languages you can hardcode the
      // strings here and comment out the call in index.html to get the localization strings.
      // set message
      var node = dom.byId("loading_message");
      if (node) {
        if (this.config && this.config.i18n) {
          node.innerHTML = this.config.i18n.map.error + ": " + error.message;
        } else {
          node.innerHTML = "Unable to create map: " + error.message;
        }
      }
    },
    // Map is ready
    _mapLoaded: function() {
      // remove loading class from body
      domClass.remove(document.body, "app-loading");

      //add gp link to popup
      var link = domConstruct.create("a", {
        "class": "action",
        "id": "statsLink",
        "innerHTML": "Calculate Land Cover", //text that appears in the popup for the link
        "href": "javascript: void(0);"
      }, query(".actionList", map.infoWindow.domNode)[0]);

      //set park name
      var park = getParkFromUrl(document.location.href);

      function getParkFromUrl(url) {
          var urlObject = urlUtils.urlToObject(url);
          if (urlObject.query && urlObject.query.park) {
            return urlObject.query.park;
          } else {
            return null;
          }
        }

      console.log(park);
      selectPark(park);
      //when the link is clicked run analysis
      on(link, "click", runAnalysis);

      //get renderer
      dojo.forEach(mapLayers, function(layer) {
        if (layer.title == "LCDBv4") {
          luren = new UniqueValueRenderer(layer.layerObject.renderer.toJson());
        }
      });

      function selectPark(park) {

        //apply a selection symbol that determines the symbology for selected features
        var sfs = new SimpleFillSymbol(
          SimpleFillSymbol.STYLE_SOLID,
          new SimpleLineSymbol(
            SimpleLineSymbol.STYLE_SOLID,
            new Color([111, 0, 255]),
            2
          ),
          new Color([111, 0, 255, 0.15])
        );

        //apply a popup template to the parcels layer to format popup info
        var popupTemplate = new PopupTemplate({
          title: "{Name}"
        });

        //add the parcels layer to the map as a feature layer in selection mode we'll use this layer to query and display the selected parcels
        National_Parks = new FeatureLayer("http://s1-support.cloud.eaglegis.co.nz/arcgis/rest/services/DOC/National_Parks_Simple/MapServer/0", {
          outFields: ["*"],
          infoTemplate: popupTemplate,
          mode: FeatureLayer.MODE_SELECTION
        });

        National_Parks.setSelectionSymbol(sfs);

          if (park) {
            var query = new Query();
            query.where = "Name = '" + park + "'";
            var deferred = National_Parks.selectFeatures(query, FeatureLayer.SELECTION_NEW, function (selection) {
              var center = graphicsUtils.graphicsExtent(selection).getCenter();
              //var extHandler = map.on("extent-change", function () {
                //extHandler.remove();
                //zoom to the center then display the popup
                map.infoWindow.setFeatures(selection);
                map.infoWindow.show(center);
              //});
              //map.centerAt(center);
            });
          }
        }


      function runAnalysis(evt) {

        map.graphics.clear();
        //display a message so user knows something is happening
        domAttr.set(dom.byId("statsLink"), "innerHTML", "Calculating...");

        //Get the feature associated with the displayed popup and use it as
        //input to the geoprocessing task. The geoprocessing task will calculate
        //land cover statistics for the area selected.

        var feature = map.infoWindow.getSelectedFeature();
        var geo = feature.geometry;
        var att = feature.attributes;
        var sym = new SimpleFillSymbol().setColor(new Color([0, 255, 255, 0.25]));

        var graphic = new Graphic(geo, sym, att);

        //create featureSet from selection

        var featureSet = new FeatureSet();
        featureSet.geometryType = "esriGeometryPolygon";
        featureSet.features = [graphic];
        //define gp task
        gp = new Geoprocessor(
          "http://s1-support.cloud.eaglegis.co.nz/arcgis/rest/services/LRIS/LCDBv4/GPServer/LCDBv4/"
        );
        //set gp parameters
        var taskParams = {
          "Feature": featureSet
        };
        //run analysis
        gp.execute(taskParams, gpResultAvailable, gpFailure);


      }

      function gpResultAvailable(results, messages) {



        //setup result popuptemplate
        template = new esri.dijit.PopupTemplate({
          title: "{Name}",
          fieldInfos: [{
            fieldName: "Name_2012",
            label: "Class",
            visible: true,
          }, {
            fieldName: "SHAPE_Area",
            label: "Land Cover (sqm)",
            visible: true,
            format: {
              places: 2,
              digitSeparator: false
            }
          }]
        });

        //reset link name
        domAttr.set(dom.byId("statsLink"), "innerHTML",
          "Calculate Land Cover");

        //display results on map
        var features = results[0].value.features;

        for (var f = 0, fl = features.length; f < fl; f++) {
          var feature = features[f];

          map.infoWindow.clearFeatures();
          feature.setInfoTemplate(template);
          map.graphics.setRenderer(luren);
          map.graphics.add(feature);

        }

        //use renderer and summary table to chart results
        var content = "";
        var data = [];
        var colors = [];


        if (results.length > 0) {

          //content = "Type=" + results[1].value.features[0].attributes.Name_2008 + " SUM=" + results[1].value.features[0];
          var table = results[1].value.features;
          for (var t = 0, tl = table.length; t < tl; t++) {
            var record = table[t];

            var lcClass = record.attributes.Class_2012;
            var lcName = record.attributes.Name_2012;

            dojo.forEach(luren.infos, function(item) {
              if (item.value == lcClass) {
                var lcColor = item.symbol.color.toHex();
                colors.push(lcColor);
              }
            });


            var lcHa = record.attributes.AreaHa;
            var ha = [lcHa];
            var item = {
              "name": lcName,
              "data": ha
            };

            data.push(item);
          }
        } else {
          content = "No Results Found";
        }

        //map.infoWindow.setContent(content);

        var chart1 = new Highcharts.Chart({
          chart: {
            renderTo: 'dir',
            type: 'column'
          },
          colors: colors,
          title: {
            text: ''
          },
          xAxis: {

            categories: ['Land Cover 2012 (LCDBv4)']
          },
          yAxis: {
            min: 0,
            title: {
              text: 'Land Cover (Ha)'
            }
          },

            tooltip: {
            formatter: function () {
                return '<b>' + this.x + '</b><br/>' +
                    this.series.name + ': ' + this.y + '<br/>' +
                    'Total: ' + this.point.stackTotal;
            }

          },
          plotOptions: {
            column: {
              stacking: 'normal',
              dataLabels: {
                enabled: false,
                color: (Highcharts.theme && Highcharts.theme.dataLabelsColor) ||
                  'white',
                style: {
                  textShadow: '0 0 3px black, 0 0 3px black'
                }
              }
            }
          },
          series: data

        });


      }

      function gpFailure(error) {
        domAttr.set(dom.byId("statsLink"), "innerHTML", "Calcutate Land Cover");

        var details = domConstruct.create("div", {
          "innerHTML": "Error = " + error
        }, query(".break", map.infoWindow.domNode)[0], "after");
        console.error("Error occurred: ", error);
      }

    },


    // create a map based on the input web map id
    _createWebMap: function(itemInfo) {
      arcgisUtils.createMap(itemInfo, "mapDiv", {
        mapOptions: {
          slider: false
          // Optionally define additional map config here for example you can
          // turn the slider off, display info windows, disable wraparound 180, slider position and more.
        },
        bingMapsKey: this.config.bingKey
      }).then(lang.hitch(this, function(response) {
        // Once the map is created we get access to the response which provides important info
        // such as the map, operational layers, popup info and more. This object will also contain
        // any custom options you defined for the template. In this example that is the 'theme' property.
        // Here' we'll use it to update the application to match the specified color theme.
        // console.log(this.config);
        map = response.map;
        mapLayers = response.itemInfo.itemData.operationalLayers;

        domClass.add(map.infoWindow.domNode, "dark");

        // make sure map is loaded
        if (map.loaded) {
          // do something with the map
          this._mapLoaded();
        } else {
          on.once(map, "load", lang.hitch(this, function() {
            // do something with the map
            this._mapLoaded();
          }));
        }
      }), this.reportError);
    }
  });
});
