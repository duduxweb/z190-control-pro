
function $(strID) 
{   
	return document.getElementById(strID);
};   

function AddEvent(elem, eventName, handler) 
{
	// NON IE
	if (elem.addEventListener) 
	{
		elem.addEventListener(eventName, handler, false);
	}
	// IE
	else if (elem.attachEvent) 
	{
		elem.attachEvent("on" + eventName, handler);
	} 
}

function RemoveEvent(elem, eventName, handler) 
{
	// IE
	if (elem.detachEvent) 
	{
		elem.detachEvent("on" + eventName, handler);
	} 
	// NON IE
	else if (elem.removeEventListener) 
	{
		elem.removeEventListener(eventName, handler, false);
	}
}

function GetEventSource(objEvent)
{
	objEvent = objEvent || window.event;
	return (obj = objEvent.srcElement ? objEvent.srcElement : objEvent.target);
}

function GetParent(objSrc)
{
	if (!objSrc)
	{
		return null;
	}
	
	if (objSrc.parentElement)
	{
		return objSrc.parentElement;
	}
	else
	{
		return objSrc.parentNode;
	}
}

function GetRootPath()
{
	var strFullPath = window.document.location.href;
	var strPath = window.document.location.pathname;
	var pos = strFullPath.indexOf(strPath);
	if (strPath == "/")
	{
		var prePath = strFullPath.substring(0, strFullPath.length - 1);
	}
	else
	{
		var prePath = strFullPath.substring(0, pos);
	}
	var postPath = strPath.substring(0, strPath.substr(1).indexOf('/') + 1);
	var postPath = "";
	return(prePath+postPath + "/");
}

function IsNumeric(strText)
{
	var ValidChars = "0123456789.";
	var IsNumber=true;
	var Char;

	for (i = 0; i < strText.length && IsNumber == true; i++)
	{
		Char = strText.charAt(i);
		if (ValidChars.indexOf(Char) == -1)
		{
			IsNumber = false;
		}
	}
	
	return IsNumber;
}

function Change1Decimal(x)
{
	var f_x = parseFloat(x);
   
	if (isNaN(f_x))
	{
		//return false;
		return "- - -";
	}
	
	var f_x = Math.floor(x * 10) / 10;
	var strValue = "" + f_x;
	if (strValue.indexOf(".") < 0)
	{
		strValue += ".0";
	}
	
	return strValue;
}

function ChangeTwoDecimal_F(x)
{
   var f_x = parseFloat(x);
   if (isNaN(f_x))
   {
     // return false;
	 return "- - -";
   }
   
   var f_x = Math.round(x*100)/100;
   var s_x = f_x.toString();
   var pos_decimal = s_x.indexOf('.');
   
   if (pos_decimal < 0)
   {
      pos_decimal = s_x.length;
      s_x += '.';
   }
   
   while (s_x.length <= pos_decimal + 2)
   {
      s_x += '0';
   }
   
   return s_x;
}

Array.prototype.remove = function(dx)
{
	if (isNaN(dx) || dx > this.length)
	{
		return false;
	}
	
	this.splice(dx, 1);
}

Array.prototype.append = function(obj)
{
	var nIndex = this.indexOf(obj);
	
	if (nIndex >= 0)
	{
		return false;
	}
	
	this.splice(this.length, 0, obj); 
}

function sleep(n)
{
	var start = new Date().getTime();
	while(true)   
	{
		if(new Date().getTime()-start > n)   
		break;
	}	
}

function Irisplusone(value)
{
	var pre = ChangeTwoDecimal_F(value);
	var next = parseInt(pre * 10 + 0.5);
	var final = Change1Decimal(Math.round(next) / 10);
	if (final * 10 % 10 == 0)
	{
		final = parseInt(final);
	}
	return final;
}

function plusone(value)
{
	var pre = ChangeTwoDecimal_F(value);
	var next = parseInt(pre * 10 + 0.5);
	var final = Change1Decimal(Math.round(next) / 10);
	return final;
}

function GetStrOffsetWidth(objSrc, iMaxWidth, strValue)
{
	if (strValue == null)
	{
		return 0;
	}
	var tmp_strLength = strValue.length;
	var tmp_strValue = strValue;
	objSrc.innerHTML  = strValue.replace(/ /g,"&nbsp;");
	for (; tmp_strLength >= 0; )
	{
		if (objSrc.offsetWidth <= iMaxWidth)
		{
			break;
		}
		else
		{
			--tmp_strLength;
			objSrc.innerHTML = tmp_strValue.substr(0, tmp_strLength).replace(/ /g,"&nbsp;");
		}
	}
	return tmp_strLength;
}

function isIE()
{
	
}
