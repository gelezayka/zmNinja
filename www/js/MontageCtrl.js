// Controller for the montage view
/* jshint -W041 */
/* jslint browser: true*/
/* global cordova,StatusBar,angular,console,ionic */


angular.module('zmApp.controllers').controller('zmApp.MontageCtrl', ['$scope', '$rootScope', 'ZMDataModel', 'message', '$ionicSideMenuDelegate', '$timeout', '$interval', '$ionicModal', '$ionicLoading', '$http', '$state', '$ionicPopup', '$stateParams', '$ionicHistory', '$ionicScrollDelegate', '$ionicPlatform', function ($scope, $rootScope, ZMDataModel, message, $ionicSideMenuDelegate, $timeout, $interval, $ionicModal, $ionicLoading, $http, $state, $ionicPopup, $stateParams, $ionicHistory, $ionicScrollDelegate) {

    //---------------------------------------------------------------------
    // Controller main
    //---------------------------------------------------------------------

    document.addEventListener("pause", onPause, false);


    var timestamp = new Date().getUTCMilliseconds();
    $scope.minimal = $stateParams.minimal;
    $scope.isRefresh = $stateParams.isRefresh;
    var sizeInProgress = false;

    $ionicSideMenuDelegate.canDragContent(false);

    var isLongPressActive = false;
    $scope.isReorder = false;
    var intervalHandleMontage; // will hold image resize timer on long press
    var montageIndex = 0; // will hold monitor ID to scale in timer

    $scope.monitorSize = []; // array with montage sizes per monitor
    $scope.scaleDirection = []; // 1 = increase -1 = decrease

    $scope.slider = {};
    $scope.slider.monsize = ZMDataModel.getMontageSize();

    console.log("********  HAVE ALL MONITORS");
    $scope.monitors = message;

    // The difference between old and original is this:
    // old will have a copy of the last re-arranged monitor list
    // while original will have a copy of the order returned by ZM

    var oldMonitors = []; // To keep old order if user cancels after sort;

    // Montage display order may be different so don't
    // mangle monitors as it will affect other screens
    // in Montage screen we will work with this local copy
    //$scope.MontageMonitors = angular.copy ($scope.monitors);

    var montageOrder = []; // This array will keep the ordering in montage view
    var hiddenOrder = []; // 1 = hide, 0 = don't hide


    // First let's check if the user already has a saved monitor order
    var i;
    if (window.localStorage.getItem("montageOrder") == undefined) {

        for (i = 0; i < $scope.monitors.length; i++) {
            montageOrder[i] = i; // order to show is order ZM returns
            hiddenOrder[i] = 0; // don't hide them
        }
        console.log("Order string is " + montageOrder.toString());
        console.log("Hiddent string is " + hiddenOrder.toString());

        ZMDataModel.zmLog("Stored montage order does not exist");
    } else
    // there is a saved order
    {
        var myorder = window.localStorage.getItem("montageOrder");
        var myhiddenorder = window.localStorage.getItem("montageHiddenOrder");

        console.log("Montage order is " + myorder);
        console.log("Hidden order is " + myhiddenorder);
        montageOrder = myorder.split(",");
        hiddenOrder = myhiddenorder.split(",");

        // at this stage, the monitor arrangement is not matching
        // the montage order. Its in true order. Let us first process the hiddenOrder part
        // now

        for (i = 0; i < montageOrder.length; i++) {
            montageOrder[i] = parseInt(montageOrder[i]);
            hiddenOrder[i] = parseInt(hiddenOrder[i]);
            //  $scope.monitors[i].Monitor.sortOrder = montageOrder[i];
            // FIXME: This will briefly show and then hide
            // disabled monitors
            if (hiddenOrder[i] == 1) {
                // $scope.monitors[i].Monitor.listDisplay='noshow';
                $scope.monitors[i].Monitor.listDisplay = 'noshow';
                ZMDataModel.zmLog("Monitor " + i + " is marked as hidden in montage");
            } else {
                $scope.monitors[i].Monitor.listDisplay = 'show';
            }
        }
        // now arrange monitors according to montage order
        // FIXME: Incredibly horrible logic
        // I really need to organize this properly into one structure

        // empty out monitors as I'll need to insert them as per montageOrder
        // remember to assign
        $scope.MontageMonitors = [];

        for (i = 0; i < montageOrder.length; i++) {
            for (j = 0; j < montageOrder.length; j++) {
                if (montageOrder[j] == i) {
                    $scope.MontageMonitors.push($scope.monitors[j]);
                }
            }
        }


        ZMDataModel.zmLog("After reloading saved order, view order is " + montageOrder.toString() + " and hidden order is " + hiddenOrder.toString());

    }


    // Do we have a saved montage array size? No?
    if (window.localStorage.getItem("montageArraySize") == undefined) {

        for (i = 0; i < $scope.monitors.length; i++) {
            $scope.monitorSize.push(ZMDataModel.getMontageSize());
            $scope.scaleDirection.push(1);
        }
    } else // recover previous settings
    {
        var msize = window.localStorage.getItem("montageArraySize");
        console.log("MontageArrayString is=>" + msize);
        $scope.monitorSize = msize.split(":");
        var j;

        for (j = 0; j < $scope.monitorSize.length; j++) {
            // convert to number other wise adding to it concatenates :-)
            $scope.monitorSize[j] = parseInt($scope.monitorSize[j]);
            $scope.scaleDirection.push(1);
            console.log("Montage size for monitor " + j + " is " + $scope.monitorSize[j]);

        }

    }
    console.log("********  SETTING VARS");
    // $scope.monitorSize = monitorSize;
    // $scope.scaleDirection = scaleDirection;

    $scope.LoginData = ZMDataModel.getLogin();
    $scope.monLimit = $scope.LoginData.maxMontage;
    console.log("********* Inside Montage Ctrl, MAX LIMIT=" + $scope.monLimit);


    // I was facing a lot of problems with Chrome/crosswalk getting stuck with
    // pending HTTP requests after a while. There is a problem with chrome handling
    // multiple streams of always open HTTP get's (image streaming). This problem
    // does not arise when the image is streamed for a single monitor - just multiple

    // To work around this I am taking a single snapshot of ZMS and have implemented a timer
    // to reload the snapshot every 1 second. Seems to work reliably even thought its a higer
    // load. Will it bonk with many monitors? Who knows. I have tried with 5 and 1280x960@32bpp


    this.loadNotifications = function () {
        // randomval is appended to img src, so after each interval the image reloads
        $scope.randomval = (new Date()).getTime();
        //console.log ("**** NOTIFICATION with rand="+$scope.randomval+"*****");
    };

    var intervalHandle = $interval(function () {
        this.loadNotifications();
        //  console.log ("Refreshing Image...");
    }.bind(this), 1000);

    this.loadNotifications();

    //-------------------------------------------------------------
    // Called when user taps on the reorder button
    //-------------------------------------------------------------

    $scope.toggleReorder = function () {
        $scope.isReorder = !$scope.isReorder;

        var i;
        oldMonitors = angular.copy($scope.monitors);
        /*for (i=0; i<$scope.monitors.length; i++)
        {
            $scope.monitors[i].Monitor.listDisplay="show";
        }*/


        var getConfig = $ionicPopup.show({
            scope: $scope,
            template: '<ion-scroll><ion-list show-delete="true" show-reorder="true">' +
                '<ion-item class="item-remove-animate" ng-repeat="item in MontageMonitors"> ' +
                '{{item.Monitor.Name}}' +
                '<ion-delete-button ng-class="' +
                '{\'ion-eye\':item.Monitor.listDisplay==\'show\',' +
                '\'ion-eye-disabled\':item.Monitor.listDisplay!=\'show\'}"' +
                'ng-click="deleteItem($index)">' +
                '</ion-delete-button>' +
                '<ion-reorder-button class="ion-navicon" ' +
                'on-reorder="reorderItem(item, $fromIndex, $toIndex)">' +
                '</ion-reorder-button></ion-item></ion-list></ion-scroll>',

            title: "Edit Montage",
            buttons: [
                {
                    // user tapped Ok
                    type: 'button-block icon ion-checkmark-round',
                    onTap: function (e) {
                        window.localStorage.setItem("montageOrder", montageOrder.toString());
                        window.localStorage.setItem("montageHiddenOrder", hiddenOrder.toString());
                        console.log("Saved " + montageOrder.toString());
                        ZMDataModel.zmLog("User press OK. Saved Monitor Order as: " + montageOrder.toString() + " and hidden order as " + hiddenOrder.toString());
                    }
                    },
                {
                    type: 'button-block icon ion-close-round',
                    onTap: function (e) {
                        // user tapped cancel
                        var i;
                        if (window.localStorage.getItem("montageOrder") == undefined) {
                            for (i = 0; i < $scope.MontageMonitors.length; i++) {
                                montageOrder[i] = i;
                                hiddenOrder[i] = 0;
                            }
                            console.log("Order string is " + montageOrder.toString());
                            ZMDataModel.zmLog("User press Cancel. Reset Monitor Order to: " + montageOrder.toString());
                        } else {
                            var myorder = window.localStorage.getItem("montageOrder");
                            var myhiddenorder = window.localStorage.getItem("montageHiddenOrder");
                            console.log("Montage order is " + myorder + " and hidden order is " + myhiddenorder);
                            montageOrder = myorder.split(",");
                            hiddenOrder = myhiddenorder.split(",");
                            for (i = 0; i < montageOrder.length; i++) {
                                montageOrder[i] = parseInt(montageOrder[i]);
                                hiddenOrder[i] = parseInt(hiddenOrder[i]);
                            }

                            $scope.MontageMonitors = oldMonitors;
                            ZMDataModel.zmLog("User press Cancel. Restored Monitor Order as: " + montageOrder.toString() + " and hidden order as: " + hiddenOrder.toString());

                        }

                    }
                    },
                {
                    type: 'button-block icon ion-loop',
                    onTap: function (e) {
                        // user tapped refresh, so don't close this dialog
                        e.preventDefault();

                        // FIXME: list visually expands then resets
                        // why?
                        var refresh = ZMDataModel.getMonitors(1);
                        refresh.then(function (data) {
                            $scope.monitors = data;
                            $scope.MontageMonitors = data;
                            oldMonitors = angular.copy($scope.monitors);
                            var i;
                            montageOrder = [];
                            for (i = 0; i < $scope.monitors.length; i++) {
                                montageOrder[i] = i;
                                hiddenOrder[i] = 0;
                            }
                            window.localStorage.setItem("montageOrder", montageOrder.toString());
                            window.localStorage.setItem("montageHiddenOrder", hiddenOrder.toString());
                            ZMDataModel.zmLog("Montage order saved on refresh: " + montageOrder.toString() + " and hidden order: " + hiddenOrder.toString());

                        });
                    }
                    }
                ]
        });
    };

    //---------------------------------------------------------------------
    // This marks a monitor as hidden in montage view
    //---------------------------------------------------------------------

    $scope.deleteItem = function (index) {
        var findindex = montageOrder.indexOf(index);
        // $scope.monitors[index].Monitor.Function = 'None';
        if ($scope.MontageMonitors[index].Monitor.listDisplay == 'show') {
            $scope.MontageMonitors[index].Monitor.listDisplay = 'noshow';
            hiddenOrder[findindex] = 1;
        } else {
            $scope.MontageMonitors[index].Monitor.listDisplay = 'show';
            // we need to find the index of Montage Order that contains index
            // because remember, hiddenOrder does not change its orders as monitors
            // move

            hiddenOrder[findindex] = 0;
        }
        //window.localStorage.setItem("montageOrder", montageOrder.toString());
        console.log("DELETE: Order Array now is " + montageOrder.toString());
        console.log("DELETE: Hidden Array now is " + hiddenOrder.toString());
        ZMDataModel.zmLog("Marked monitor " + findindex + " as " + $scope.MontageMonitors[index].Monitor.listDisplay + " in montage");

    };

    //---------------------------------------------------------------------
    // When we re-arrange the montage, all the ordering index moves
    // horrible horrible code
    //---------------------------------------------------------------------

    function reorderItem(item, from, to, reorderHidden) {

        console.log("FROM " + from + " TO " + to);
        $scope.MontageMonitors.splice(from, 1);
        $scope.MontageMonitors.splice(to, 0, item);

        // Now we need to re-arrange the montageOrder
        // hiddenOrder remains the same

        var i, j;
        for (i = 0; i < $scope.monitors.length; i++) {
            for (j = 0; j < $scope.MontageMonitors.length; j++) {
                if ($scope.monitors[i].Monitor.Id == $scope.MontageMonitors[j].Monitor.Id) {
                    montageOrder[i] = j;
                    break;
                }
            }
        }
        ZMDataModel.zmLog("New Montage Order is: " + montageOrder.toString());

    }


    $scope.reorderItem = function (item, from, to) {
        reorderItem(item, from, to, true);
    };


    //---------------------------------------------------------------------
    // Triggered when you enter/exit full screen
    //---------------------------------------------------------------------
    $scope.switchMinimal = function () {
        $scope.minimal = !$scope.minimal;
        console.log("Hide Statusbar");
        ionic.Platform.fullScreen($scope.minimal, !$scope.minimal);
        $interval.cancel(intervalHandle); //we will renew on reload
        // We are reloading this view, so we don't want entry animations
        $ionicHistory.nextViewOptions({
            disableAnimate: true,
            disableBack: true
        });
        $state.go("montage", {
            minimal: $scope.minimal,
            isRefresh: true
        });
    };

    //---------------------------------------------------------------------
    // Show/Hide PTZ control in monitor view
    //---------------------------------------------------------------------
    $scope.togglePTZ = function () {
        $scope.showPTZ = !$scope.showPTZ;
    };

    $scope.callback = function () {
        console.log("dragging");
    };


    $scope.onDropComplete = function (index, obj, event) {
        console.log("dragged");
        var otherObj = $scope.monitors[index];
        var otherIndex = $scope.monitors.indexOf(obj);
        $scope.monitors[index] = obj;
        $scope.monitors[otherIndex] = otherObj;
    };


    //---------------------------------------------------------------------
    // main monitor modal open
    //---------------------------------------------------------------------
    $scope.openModal = function (mid, controllable, controlid) {
        console.log("Open Monitor Modal with monitor Id=" + mid + " and Controllable:" + controllable + " with control ID:" + controlid);

        // Note: no need to setAwake(true) as its already awake
        // in montage view
        $scope.monitorId = mid;
        $scope.LoginData = ZMDataModel.getLogin();
        $scope.rand = Math.floor(Math.random() * (999999 - 111111 + 1)) + 111111;
        $scope.ptzMoveCommand = "";

        // This is a modal to show the monitor footage
        // We need to switch to always awake if set so the feed doesn't get interrupted
        ZMDataModel.setAwake(ZMDataModel.getKeepAwake());

        // if its controllable, lets get the control command
        if (controllable == '1') {
            var apiurl = $scope.LoginData.apiurl;
            var myurl = apiurl + "/controls/" + controlid + ".json";
            console.log("getting control details:" + myurl);

            $http.get(myurl)
                .success(function (data) {
                    $scope.ptzMoveCommand = (data.control.Control.CanMoveCon == '1') ? 'moveCon' : 'move';
                    console.log("***moveCommand: " + $scope.ptzMoveCommand);
                    ZMDataModel.zmLog("ControlDB reports PTZ command to be " + $scope.ptzMoveCommand);
                })
                .error(function (data) {
                    console.log("** Error retrieving move PTZ command");
                    ZMDataModel.zmLog("Error retrieving PTZ command  " + JSON.stringify(data), "error");
                });
        }

        // This is a modal to show the monitor footage
        $ionicModal.fromTemplateUrl('templates/monitors-modal.html', {
                scope: $scope,
                animation: 'slide-in-up'
            })
            .then(function (modal) {
                $scope.modal = modal;

                $ionicLoading.show({
                    template: "please wait...",
                    noBackdrop: true,
                    duration: 15000
                });
                $scope.isControllable = controllable;
                $scope.showPTZ = false;
                $scope.modal.show();
            });

    };

    //---------------------------------------------------------------------
    //
    //---------------------------------------------------------------------

    $scope.closeModal = function () {
        console.log("Close & Destroy Monitor Modal");
        // Note: no need to setAwake(false) as needs to be awake
        // in montage view
        $scope.modal.remove();

    };

    //---------------------------------------------------------------------
    // allows you to resize individual montage windows
    //---------------------------------------------------------------------
    function scaleMontage() {
        var index = montageIndex;
        console.log(" MONTAGE INDEX === " + montageIndex);
        console.log("Scaling Monitor " + index);
        if ($scope.monitorSize[index] == 6)
            $scope.scaleDirection[index] = -1;

        if ($scope.monitorSize[index] == 1)
            $scope.scaleDirection[index] = 1;

        $scope.monitorSize[index] += $scope.scaleDirection[index];

        console.log("Changed size to " + $scope.monitorSize[index]);

        var monsizestring = "";
        var i;
        for (i = 0; i < $scope.monitors.length; i++) {
            monsizestring = monsizestring + $scope.monitorSize[i] + ':';
        }
        monsizestring = monsizestring.slice(0, -1); // kill last :
        console.log("Setting monsize string:" + monsizestring);
        window.localStorage.setItem("montageArraySize", monsizestring);
    }

    //---------------------------------------------------------------------
    // if you long press on a montage window, it calls scale montage
    // at a 200ms freq
    //---------------------------------------------------------------------
    $scope.onHold = function (index) {
        montageIndex = index;
        isLongPressActive = true;
        intervalHandleMontage = $interval(function () {
            scaleMontage();

        }.bind(this), 200);

    };

    //---------------------------------------------------------------------
    // stop scaling montage window on release
    //---------------------------------------------------------------------
    $scope.onRelease = function (index) {
        console.log("Press release on " + index);
        isLongPressActive = false;
        $interval.cancel(intervalHandleMontage);
    };



    //---------------------------------------------------------------------
    // In Android, the app runs full steam while in background mode
    // while in iOS it gets suspended unless you ask for specific resources
    // So while this view, we DON'T want Android to keep sending 1 second
    // refreshes to the server for images we are not seeing
    //---------------------------------------------------------------------

    function onPause() {
        console.log("*** Moving to Background ***"); // Handle the pause event
        console.log("*** CANCELLING INTERVAL ****");
        $interval.cancel(intervalHandle);
        // FIXME: Do I need to  setAwake(false) here?
    }



    $scope.openMenu = function () {
        $ionicSideMenuDelegate.toggleLeft();
    };

    $scope.$on('$destroy', function () {
        console.log("*** CANCELLING INTERVAL ****");
        $interval.cancel(intervalHandle);
    });


    $scope.$on('$ionicView.loaded', function () {
        console.log("**VIEW ** Montage Ctrl Loaded");
    });

    $scope.$on('$ionicView.enter', function () {
        console.log("**VIEW ** Montage Ctrl Entered");
        console.log("Setting Awake to " + ZMDataModel.getKeepAwake());
        ZMDataModel.setAwake(ZMDataModel.getKeepAwake());
    });

    $scope.$on('$ionicView.leave', function () {
        console.log("**VIEW ** Montage Ctrl Left");
    });

    $scope.$on('$ionicView.unloaded', function () {
        console.log("**VIEW ** Montage Ctrl Unloaded");
    });

    //---------------------------------------------------------
    // This function readjusts  montage size
    //  and stores current size to persistent memory
    //---------------------------------------------------------

    function processSliderChanged(val) {
        if (sizeInProgress) return;

        sizeInProgress = true;
        console.log('Size has changed');
        ZMDataModel.setMontageSize(val);
        console.log("ZMData Montage is " + ZMDataModel.getMontageSize() +
            " and slider montage is " + $scope.slider.monsize);
        // Now go ahead and reset sizes of entire monitor array
        var monsizestring = "";
        var i;
        for (i = 0; i < $scope.monitors.length; i++) {

            $scope.monitorSize[i] = parseInt(ZMDataModel.getMontageSize());
            console.log("Resetting Monitor " + i + " size to " + $scope.monitorSize[i]);
            $scope.scaleDirection[i] = 1;
            monsizestring = monsizestring + $scope.monitorSize[i] + ':';
        }
        monsizestring = monsizestring.slice(0, -1); // kill last :
        console.log("Setting monsize string:" + monsizestring);
        window.localStorage.setItem("montageArraySize", monsizestring);
        sizeInProgress = false;
    }

    //---------------------------------------------------------
    // In full screen montage view, I call this function
    // as slider is hidden
    //---------------------------------------------------------

    $scope.changeSize = function (val) {
        var newSize = parseInt($scope.slider.monsize) + val;

        $scope.slider.monsize = newSize;
        if ($scope.slider.monsize < "1") $scope.slider.monsize = "1";
        if ($scope.slider.monsize > "6") $scope.slider.monsize = "6";
        processSliderChanged($scope.slider.monsize);

    };

    //---------------------------------------------------------
    // slider is tied to the view slider for montage
    //Remember not to use a variable. I'm using an object
    // so it's passed as a reference - otherwise it makes
    // a copy and the value never changes
    //---------------------------------------------------------

    $scope.sliderChanged = function () {
        processSliderChanged($scope.slider.monsize);
    };

    $scope.$on('$ionicView.afterEnter', function () {
        // This rand is really used to reload the monitor image in img-src so it is not cached
        // I am making sure the image in montage view is always fresh
        // I don't think I am using this anymore FIXME: check and delete if needed
        $rootScope.rand = Math.floor((Math.random() * 100000) + 1);
    });




    $scope.doRefresh = function () {
        console.log("***Pull to Refresh");
        $scope.monitors = [];

        var refresh = ZMDataModel.getMonitors(1);
        refresh.then(function (data) {
            $scope.monitors = data;
            $scope.$broadcast('scroll.refreshComplete');
        });

    };


}]);
