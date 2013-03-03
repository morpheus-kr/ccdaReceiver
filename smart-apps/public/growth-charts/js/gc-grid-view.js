/*global 
Chart, GC, PointSet, strPad, weeks2months, Raphael, console, getLineXatY, $,
jQuery, debugLog, cropCurvesDataX, getCurvesData, getYatX, findMinMax, scale,
sumLinesY, getLinesMinDistanceY, months2weeks, XDate, setTimeout, getDataSet*/

/*jslint undef: true, eqeq: true, nomen: true, plusplus: true, forin: true*/
(function(NS, $) {
	
	//"use strict";
	
	var selectedIndex = -1,
	
		/**
		 * The cached value from GC.App.getMetrics()
		 */
		metrics = null,
		
		/**
		 * The scheme used to create and render the grid
		 */
		scheme,
		
		PRINT_MODE = $("html").is(".before-print"),
		
		EMPTY_MARK = PRINT_MODE ? "" : "&#8212;",
		
		MILISECOND = 1,
		SECOND     = MILISECOND * 1000,
		MINUTE     = SECOND * 60,
		HOUR       = MINUTE * 60,
		DAY        = HOUR * 24,
		WEEK       = DAY * 7,
		MONTH      = WEEK * 4.348214285714286,
		YEAR       = MONTH * 12;
	
	function getLength( entry ) {
		if ( entry.hasOwnProperty("lengthAndStature") ) {
			if ( metrics == "metric" ) {
				return GC.Util.roundToPrecision(entry.lengthAndStature, 1) + '<span class="units"> cm</span>'; 
			}
			return GC.Util.cmToUS(entry.lengthAndStature, '<span class="units">ft</span>', '<span class="units">in</span>');
		}
		return EMPTY_MARK;
	}
	
	function getWeight( entry ) {
		if ( entry.hasOwnProperty("weight") ) {
			if ( metrics == "metric" ) {
				return GC.Util.roundToPrecision(entry.weight, 1) + '<span class="units"> kg</span>'; 
			}
			return GC.Util.kgToUS(entry.weight, '<span class="units">lb</span>', '<span class="units">oz</span>');
		}
		return EMPTY_MARK;
	}
	
	function getHeadC( entry ) {
		if ( entry.hasOwnProperty("headc") ) {
			if ( metrics == "metric" ) {
				return GC.Util.roundToPrecision(entry.headc, 1) + '<span class="units"> cm</span>'; 
			}
			return GC.Util.cmToUS(entry.headc, '<span class="units">ft</span>', '<span class="units">in</span>');
		}
		return EMPTY_MARK;
	}
	
	function getBMI( entry ) {
		if ( entry.hasOwnProperty("bmi") ) {
			if ( metrics == "metric" ) {
				return GC.Util.roundToPrecision(entry.bmi, 1) + '<span class="units"> kg/m2</span>'; 
			}
			return GC.Util.roundToPrecision(
				entry.bmi * GC.Constants.METRICS.KILOGRAMS_IN_POUND, 
				1
			) + '<span class="units">lb/ft2</span>';
		}
		return EMPTY_MARK;
	}
	
	function getPercentile( entry, prop ) {
		if (entry.hasOwnProperty(prop)) {
			var ds = getDataSet(prop), pct;
			if (ds) {
				pct = GC.findPercentileFromX(
					entry[prop], 
					ds, 
					GC.App.getGender(), 
					entry.agemos
				);
				if ( isNaN(pct) || !isFinite(pct) ) {
					return EMPTY_MARK;
				}
				return GC.Util.roundToPrecision(pct * 100, 0);
			}
		}
		return EMPTY_MARK;
	}
	
	function getZScore( entry, prop ) {
		if (entry.hasOwnProperty(prop)) {
			var ds = getDataSet(prop), z;
			if (ds) {
				z = GC.findZFromX(
					entry[prop], 
					ds, 
					GC.App.getGender(), 
					entry.agemos
				);
				if ( isNaN(z) || !isFinite(z) ) {
					return EMPTY_MARK;
				}
				return GC.Util.roundToPrecision(z, 1);
			}
		}
		return EMPTY_MARK;
	}
	
	function getVelocity( entry, prop ) {
		if ( entry.hasOwnProperty(prop) ) {
			var prev = GC.App.getPatient().getPrevModelEntry(entry.agemos, function(o) {
				return o.hasOwnProperty(prop);
			}), v;
			if ( prev ) {
				v = (entry[prop] - prev[prop]) / (entry.agemos - prev.agemos);
				return GC.Util.roundToPrecision(v * 12, 1);
			}
		}
		return EMPTY_MARK;
	}
	
	function getDataSet( type ) {
		var ds = GC.App.getPrimaryChartType();
		switch (type.toLowerCase()) {
			case "length":
			case "stature":
			case "lengthandstature":
				return GC.DATA_SETS[ds + "_STATURE"];
			case "weight":
				return GC.DATA_SETS[ds + "_WEIGHT"];
			case "headc":
				return GC.DATA_SETS[ds + "_HEAD_CIRCUMFERENCE_INF"];
		}
	}
	
	function createHeaderTable(container) {
		var headerTable = $(
			'<table class="datatable-headers" cellspacing="0">' +
				'<tr class="date"><th colspan="2">' + GC.str("STR_35") + '</th></tr>' +
				'<tr class="age"><th colspan="2">' + GC.str("STR_36") + '</th></tr>' +
			'</table>'
		).appendTo(container);
		
		$.each(scheme.header.rows, function(i, o) {
			var tr = $("<tr/>"), 
				colspan = 2,
				td;
			
			if ( o.rowClass ) {
				tr.addClass( o.rowClass );
			}
			
			if ( o.units ) {
				colspan = 1;
				$('<td/>').text( o.units[metrics] ).appendTo( tr );
			} else if (o.secondCell) {
				colspan = 1;
				$('<td/>').html(o.secondCell).appendTo( tr );
			}
			
			td = $('<td/>').html('<div>' + GC.str(o.label) + '</div>');
			td.attr( "colspan", colspan );
			td.prependTo( tr );
			tr.appendTo(headerTable);
		});
		
		$('<tr class="footer-row"><td colspan="2">&nbsp;</td></tr>').appendTo(headerTable);
		
		return headerTable;
	}
	
	function renderTableView( container ) {
		$(container).empty();
		
		metrics = GC.App.getMetrics();
		
		var patient = GC.App.getPatient(),
			
			model = patient.getModel(),
			
			scroller = $('<div class="datatable-scroller"/>').appendTo(container),
			
			table = $('<table class="datatable" cellspacing="1"/>').appendTo(scroller),
			
			// The data-table header rows
			thr1 = $('<tr class="date"/>').appendTo(table),
			thr2 = $('<tr class="age"/>').appendTo(table),
			
			lastDate,
			
			i;
		
		// The header table (left table) ---------------------------------------
		createHeaderTable(container);
		
		for ( i = 0; i < scheme.header.rows.length; i++ ) {
			$('<tr/>').appendTo(table);
		}
		
		
		$.each(model, function( index, data ) {
			//debugger;
			var time = data.agemos * MONTH,
				age  = new GC.TimeInterval(patient.DOB).setMonths(data.agemos),
				date = age.getEndDate(),
				sameDay = lastDate && lastDate.diffDays(date) < 1,
				dateText = sameDay ? 
					'<div style="text-align: center;font-size:20px">&bull;</div>' : 
					date.toString(GC.chartSettings.dateFormat),
				years,
				months,
				days;
				//console.log(age);
				
			years = Math.floor(time/YEAR);
			time -= years * YEAR;
			
			months = Math.floor(time/MONTH);
			time -= months * MONTH;
			
			days = Math.floor(time/DAY);
			time -= days * DAY;
			
			// Header - Date
			$('<th/>').append( 
				$('<div class="date"/>').html(dateText)
			)
			.appendTo(thr1);
			
			// Header - Age
			$('<th/>')
				.append( $('<div class=""/>').html(
					sameDay ? 
					new XDate(time).toString(GC.chartSettings.timeFormat) :
					age.toString({
						"Years"  : "y",
						"Year"   : "y",
						"Months" : "m",
						"Month"  : "m",
						"Weeks"  : "w",
						"Week"   : "w",
						"Days"   : "d",
						"Day"    : "d",
						separator : " "
					})
				)
			).appendTo(thr2);
			
			$.each(scheme.header.rows, function(i, o) {
				
				var tr = $('tr:eq(' + ( i + 2 ) + ')', table),
					td = $('<td/>').appendTo(tr);
				if ( o.get ) {
					td.html( o.get( data, model ) );
				}
				
				if ( !index ) { // first data column
					if ( o.rowClass ) {
						tr.addClass( o.rowClass );
					}
				}
			});
			
			$('<tr class="footer-row"><td>&nbsp;</td></tr>').appendTo(table);
			
			lastDate = date;
		});
		
		setTimeout(function() {
			updateDataTableLayout();
			if (GC.SELECTION.selected.record) {
				selectByAge(GC.SELECTION.selected.age.getMilliseconds(), true);
			}
		}, 0);
	}
	
	function isTableViewVisible() {
		return GC.App.getViewType() == "table";
	}
	
	function updateDataTableLayout() {
		if (isTableViewVisible()) {
			var stage    = $("#stage")[0],
				scroller = $(".datatable-scroller");
				
			scroller.css("left", $(".datatable-headers").outerWidth());
			$(".datatable tr:first th, .datatable-headers tr:first th").equalHeight();
			
			if (scroller.length) {
				scroller.css("height", "auto").height( 
					stage.clientHeight + stage.scrollTop - 1 // 1 is for the top border
				); 
			}
		}
	}
	
	function updateVelocity() {
		if ( !selectedIndex || selectedIndex < 0 ) {
			return;
		}
		var patient       = GC.App.getPatient(),
			model         = patient.getModel(),
			selectedEntry = model[selectedIndex];
		
		if ( !selectedEntry ) {
			return;
		}
		
		$.each({
			"lengthAndStature" : "length",
			"weight" : "weight",
			"headc" : "headc"
		}, function( modelProp, rowClassName ) {
			
			var selectedValue = selectedEntry[ modelProp ];
			
			if ( !selectedValue && selectedValue !== 0 ) {
				return true;
			}
			
			$(".datatable tr.velocity." + rowClassName + " td").each(function(colIndex, td) {
				var entry = model[colIndex], t, x, v;
				if ( colIndex < selectedIndex ) {
					t = selectedEntry.agemos - entry.agemos;
					x = selectedEntry[modelProp] - entry[modelProp];
					v = x / t;
					v = GC.Util.roundToPrecision(v * 12, 1);
					td.innerHTML = isNaN(v) || !isFinite(v) ? "&#8212;" : v;
				}
				else if ( colIndex > selectedIndex ) {
					t = entry.agemos - selectedEntry.agemos;
					x = entry[modelProp] - selectedEntry[modelProp];
					v = x / t;
					v = GC.Util.roundToPrecision(v * 12, 1);
					td.innerHTML = isNaN(v) || !isFinite(v) ? "&#8212;" : v;
				} 
				else {
					td.innerHTML = "<b>To here</b>";
				}
			});
			
		});
		
		
	}
	
	function setColIndex( idx, force ) {
		idx = GC.Util.intVal( idx );
		if ( idx  >= 0 && (force || idx !== selectedIndex) ) {
			var model    = GC.App.getPatient().getModel(),
				len      = model.length,
				scroller = $(".datatable-scroller"),
				duration = idx == selectedIndex ? 0 : 400,
				cells, cell;
			if ( idx < len ) {
				// Inselect selected cells (if any)
				$(".datatable td.active, .datatable th.active").removeClass("active");
				
				// Select new cells
				cells = $(".datatable").find(
					"td:nth-child(" + (idx + 1) + "), th:nth-child(" + (idx + 1) + ")"
				);
				cells.addClass("active");//[0].scrollIntoView();
				
				// Store to private var
				selectedIndex = idx;
				
				updateVelocity();
				
				if (isTableViewVisible()) {
					cell = cells[0];
					scroller.animate({ 
						scrollLeft: cell.offsetLeft + cell.offsetWidth / 2 - scroller[0].clientWidth / 2 
					}, duration);
				}
			}
		}
	}
	
	function selectByAge(ms, force) {
		var i = GC.App.getPatient().geModelIndexAtAgemos(ms / GC.Constants.TIME.MONTH);
		if (i || i === 0) {
			setColIndex(i, force);
		}
	}
	
	function initAnnotationPopups() {
		var _annotationPopup;
		function createAnnotationPopup(record) {
			if (!_annotationPopup) {
				_annotationPopup = $(
					'<div id="annotation-popup">\
						<div class="header">\
							<div class="title">Annotation</div>\
							<span class="close" title="Close"></span>\
						</div>\
						<div class="content"></div>\
					</div>'
				).appendTo("body");
			}
			
			_annotationPopup.find(".content").html(record.annotation.txt);
			
			return _annotationPopup;
		}
		
		$("html").on("click", ".annotation-wrap", function(e) {
			var i   = $(this).closest("tr").find("td").index(this.parentNode),
				rec = GC.App.getPatient().getModel()[i],
				ofs;
				
			createAnnotationPopup(rec).appendTo(this).css({
				right: 0,
				left : "auto"
			}).show();
			
			//ofs = _annotationPopup.offset();
			if (this.offsetLeft + _annotationPopup.outerWidth(true) < $(".datatable").width()) {
				_annotationPopup.css({
					right: "auto",
					left : 0
				});
			}
			
			e.stopPropagation();
			$(this).css("overflow", "visible");
			
		}).on("mousedown", "#annotation-popup .close", function(e) {
			_annotationPopup.parent().css("overflow", "hidden");
			_annotationPopup.remove();
		});
	}
	
	function renderTableViewForPrint(container) {
		$(container).empty();
		
		var printScheme = [
			{
				label : "Date",
				get   : function( entry, model ) {
					return new GC.TimeInterval(patient.DOB)
						.setMonths(entry.agemos)
						.getEndDate()
						.toString(GC.chartSettings.dateFormat);
				},
				style : "text-align:left"
			},
			{
				label : "Age",
				get   : function( entry, model ) {
					return new GC.TimeInterval(patient.DOB)
						.setMonths(entry.agemos)
						.toString({
							"Years"  : "y",
							"Year"   : "y",
							"Months" : "m",
							"Month"  : "m",
							"Weeks"  : "w",
							"Week"   : "w",
							"Days"   : "d",
							"Day"    : "d",
							separator : " "
						});
				},
				style : "text-align:left; color:black"
			},
			{
				label : "Length",
				children : [
					{
						label : "Value",
						get   : getLength,
						style : "color:black"
					},
					{
						label : "Percentile",
						get   : function( entry, model ) {
							return getPercentile( entry, "lengthAndStature" );
						}
					},
					{
						label : "Z Score",
						get   : function( entry, model ) {
							return getZScore( entry, "lengthAndStature" );
						}
					},
					{
						label : "Velocity",
						get   : function( entry, model ) {
							return getVelocity( entry, "lengthAndStature" );
						}
					}
				]
			},
			{
				label : "Weight",
				children : [
					{
						label : "Value",
						get   : getWeight,
						style : "color:black"
					},
					{
						label : "Percentile",
						get   : function( entry, model ) {
							return getPercentile( entry, "weight" );
						}
					},
					{
						label : "Z Score",
						get   : function( entry, model ) {
							return getZScore( entry, "weight" );
						}
					},
					{
						label : "Velocity",
						get   : function( entry, model ) {
							return getVelocity( entry, "weight" );
						}
					}
				]
			},
			{
				label : "Head C",
				children : [
					{
						label : "Value",
						get   : getHeadC,
						style : "color:black"
					},
					{
						label : "Percentile",
						get   : function( entry, model ) {
							return getPercentile( entry, "headc" );
						}
					},
					{
						label : "Z Score",
						get   : function( entry, model ) {
							return getZScore( entry, "headc" );
						}
					},
					{
						label : "Velocity",
						get   : function( entry, model ) {
							return getVelocity( entry, "headc" );
						}
					}
				]
			},
			{
				label : "BMI",
				get   : getBMI,
				style : "color:black"
			},
			{
				label : "Bone Age",
				get   : function( entry, model ) {
					if (entry.hasOwnProperty("boneAge")) {
						var time = new GC.TimeInterval();
						time.setMonths(entry.boneAge);
						return time.toString({
							"Years"   : "yrs", 
							"Year"    : "yr", 
							"Months"  : "mts", 
							"Month"   : "mnt", 
							"Weeks"   : false,
							"Days"    : false,
							separator : " "
						});
					}
					return EMPTY_MARK;
				},
				style : "color:black"
			}
		];
		
		var html = [], j = 0;
		
		html[j++] = '<table border="1" cellpadding="3" class="print-table">';
		
		// Header row 1 ========================================================
		html[j++] = '<tr>';
		$.each(printScheme, function(i, o) {
			if (o.children) {
				html[j++] = '<th colspan="' + o.children.length + '">';
			} else {
				html[j++] = '<th rowspan="2">';
			}
			html[j++] = o.label;
			html[j++] = '</th>';
		});
		html[j++] = '</tr>';
		
		// Header row 2 ========================================================
		html[j++] = '<tr>';
		$.each(printScheme, function(i, o) {
			if (o.children) {
				$.each(o.children, function() {
					html[j++] = '<th>';
					html[j++] = this.label;
					html[j++] = '</th>';
				});
			}
		});
		html[j++] = '</tr>';
		
		// Table Body ==========================================================
		var patient = GC.App.getPatient(),
			model = patient.getModel();
			
		function createCell(meta, entry) {
			var html = '<td';
			if (meta.style) {
				html += ' style="' + meta.style + '"';
			}
			html += '>' + (meta.get ? meta.get(entry) : "") + '</td>';
			return html;
		}
		
		$.each(model, function( index, data ) {
			html[j++] = '<tr class="' + (index % 2 ? "odd" : "even") + '">';
			$.each(printScheme, function(i, o) {
				if (o.children) {
					$.each(o.children, function() {
						html[j++] = createCell(this, data);
					});
				} else {
					html[j++] = createCell(this, data);
				}
			});
			html[j++] = '</tr>';
		});
		
		
		
		html[j++] = '</table>';
		
		$(container).html(html.join(""));
	}
	
	/**
	 * The scheme used to create and render the grid
	 */
	scheme = {
		header : {
			rows : [
				// Annotation
				{
					label : "STR_12", // Annotation
					get   : function( entry, model ) {
						return entry.annotation ? 
							'<div class="annotation-wrap">' + 
							ellipsis(entry.annotation.txt, 6, 36, "...") + 
							'</div>' : 
							"&#8212;";
					},
					rowClass : "annotation",
					secondCell : '<a href="javascript:GC.App.viewAnnotations();" class="annotations-see-all">See all</a>'
				},
				
				// Med Service
				//{
				//	label : "STR_31", // Medical Service
				//	get   : function( entry, model ) {
				//		return "&#8212;";
				//	},
				//	rowClass : "med-service"
				//},
				
				// Length
				{
					label : "STR_2", // Length
					units : { metric : "cm", eng : "ft in" },
					get   : getLength,
					rowClass : "length heading",
					printrow : 1,
					printColspan : 3
				},
				{
					label : "STR_9", // Percentile
					units : { metric : "%", eng : "%" },
					get   : function( entry, model ) {
						return getPercentile( entry, "lengthAndStature" );
					},
					rowClass : "length percentile",
					printrow : 2
				},
				{
					label : "STR_7", // Z Score
					units : { metric : "Z", eng : "Z" },
					get   : function( entry, model ) {
						return getZScore( entry, "lengthAndStature" );
					},
					rowClass : "length z-score",
					printrow : 2
				},
				{
					label : "STR_10", // Velocity
					units : { metric : "cm/year", eng : "in/year" },
					get   : function( entry, model ) {
						return getVelocity( entry, "lengthAndStature" );
					},
					rowClass : "length velocity",
					printrow : 2
				},
				
				
				// Weight
				{
					label : "STR_6", // Weight
					units : { metric : "kg", eng : "lb oz" },
					get   : getWeight,
					rowClass : "weight heading",
					printrow : 1,
					printColspan : 3
				},
				{
					label : "STR_9", // Percentile
					units : { metric : "%", eng : "%" },
					get   : function( entry, model ) {
						return getPercentile( entry, "weight" );
					},
					rowClass : "weight percentile",
					printrow : 2
				},
				{
					label : "STR_7", // Z Score
					units : { metric : "Z", eng : "Z" },
					get   : function( entry, model ) {
						return getZScore( entry, "weight" );
					},
					rowClass : "weight z-score",
					printrow : 2
				},
				{
					label : "STR_10", // Velocity
					units : { metric : "kg/year", eng : "lb/year" },
					get   : function( entry, model ) {
						return getVelocity( entry, "weight" );
					},
					rowClass : "weight velocity",
					printrow : 2
				},
				
				// Head C
				{
					label : "STR_13", // Head C
					units : { metric : "cm", eng : "in" },
					get   : getHeadC,
					rowClass : "headc heading",
					printrow : 1
				},
				{
					label : "STR_9", // Percentile
					units : { metric : "%", eng : "%" },
					get   : function( entry, model ) {
						return getPercentile( entry, "headc" );
					},
					rowClass : "headc percentile"
				},
				{
					label : "STR_7", // Z Score
					units : { metric : "Z", eng : "Z" },
					get   : function( entry, model ) {
						return getZScore( entry, "headc" );
					},
					rowClass : "headc z-score"
				},
				{
					label : "STR_10", // Velocity
					units : { metric : "cm/year", eng : "in/year" },
					get   : function( entry, model ) {
						return getVelocity( entry, "headc" );
					},
					rowClass : "headc velocity"
				},
				
				// BMI
				{
					label : "STR_14", // BMI
					units : { metric : "kg/m2", eng : "lb/ft2" },
					get   : getBMI,
					rowClass : "bmi heading",
					printrow : 1
				},
				
				{
					label : "STR_11", // Bone Age
					units : { metric : "y m", eng : "y m" },
					get   : function( entry, model ) {
						if (entry.hasOwnProperty("boneAge")) {
							var time = new GC.TimeInterval();
							time.setMonths(entry.boneAge);
							return time.toString({
								"Years"   : "y", 
								"Year"    : "y", 
								"Months"  : "m", 
								"Month"   : "m", 
								"Weeks"   : false,
								"Days"    : false,
								separator : " "
							});
						}
						return "&#8212;";
					},
					rowClass : "bone-age heading",
					printrow : 1
				}
			]
		}
	};
	
	
	NS.TableView = {
		render : function() {
			if (PRINT_MODE) {
				renderTableViewForPrint("#view-table");
			} else {
				renderTableView("#view-table");
			}
		},
		selectByAge : PRINT_MODE ? $.noop : selectByAge
	};
	
	$(function() {
		if (!PRINT_MODE) {
			$("#stage").bind("scroll resize", updateDataTableLayout);
			$(window).bind("resize", updateDataTableLayout);
			
			updateDataTableLayout();
			initAnnotationPopups();
			
			$("#stage").on("click", ".datatable td, .datatable th", function() {
				//debugger;
				var i = 0, tmp = this;
				while ( tmp.previousSibling ) {
					tmp = tmp.previousSibling;
					i++;
				}
				GC.App.setSelectedRecord(GC.App.getPatient().getModel()[i], "selected");
			});
			
			$("html").bind("set:viewType set:language", function(e) {
				if (isTableViewVisible()) {
					renderTableView("#view-table");
				}
			});
			
			GC.Preferences.bind("set:metrics", function(e) {
				if (isTableViewVisible()) {
					renderTableView("#view-table");
				}
			});
			
			GC.Preferences.bind("set:fontSize", function(e) {
				updateDataTableLayout();
			});
			
			GC.Preferences.bind("set:timeFormat", function(e) {
				renderTableView("#view-table");
			});
			
			$("#stage").on("dblclick", ".datatable td, .datatable th", function() {
				var i = $(this).closest("tr").find("td").index(this);
				GC.App.editEntry(GC.App.getPatient().getModel()[i]);
			});
			
			$("html").bind("appSelectionChange", function(e, selType, sel) {
				if (selType == "selected") {
					selectByAge(sel.age.getMilliseconds());
				}
			});
		}
	});
	
}(GC, jQuery));